import { createTestLinkClient } from "../lib/testlinkClient.js";

// TestLink XML-RPC adapter. Maps every targeted project's test suite tree +
// every targeted test plan's execution results (TESTLINK_PROJECT_NAME /
// TESTLINK_TEST_PLAN_NAME — comma-separated, blank means "all of them") into
// the dashboard's Normalised TestCase Schema (see TestManagementDashboard.jsx
// for the contract).
//
// Known simplifications, called out because they're genuinely
// installation-specific and can't be guessed generically:
//  - "Manual vs Automated" has no standard TestLink field. We treat a test
//    case as Automated if it carries the TESTLINK_AUTOMATION_KEYWORD keyword.
//  - Execution status comes from the single most recent entry TestLink
//    returns per test case for the configured test plan — it does not
//    cross-reference a specific build.
//  - Per-test-case calls (keywords, custom fields, requirements) are batched
//    with Promise.all per suite, which is fine for hundreds of test cases
//    but should be cached/throttled for much larger projects.
//
// Server-side landmine: tl.getTestCasesForTestSuite's `details: "full"`
// option crashes on several real-world TestLink installs (PHP 8 hit an
// unquoted `full` constant in testsuite.class.php that should have been the
// string 'full' — TestLink returns a raw PHP fatal-error HTML page instead
// of XML-RPC). There is no client-side workaround for that — we deliberately
// always request `details: "simple"` and fetch keywords separately
// (also wrapped defensively, since some installs' tl.getTestCaseKeywords
// has the same class of bug) rather than depend on the broken path.
let keywordsApiWarned = false;

function normalizeToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function mapExecStatus(code) {
  if (code === "p") return "Passed";
  if (code === "f") return "Failed";
  if (code === "b") return "Blocked";
  return "Not Run";
}

async function collectSuites(call, testProjectId) {
  const top = normalizeToArray(await call("tl.getFirstLevelTestSuitesForTestProject", { testprojectid: testProjectId }));
  const all = [];

  async function walk(suite, topName) {
    all.push({ id: suite.id, topName });
    const children = normalizeToArray(await call("tl.getTestSuitesForTestSuite", { testsuiteid: suite.id }));
    for (const child of children) {
      await walk(child, topName);
    }
  }

  for (const suite of top) {
    await walk(suite, suite.name);
  }
  return all;
}

// Pulls execution status from every test plan in `planNames` (or every plan
// in the project, if planNames is empty) and merges them, since a test case
// can be executed under more than one plan — the most recent execution
// across all of them wins.
//
// tl.getTestCasesForTestPlan's bulk entries carry status/build/full_external_id
// but — on at least this TestLink version — neither an execution timestamp
// nor the tester, so we can't pick "most recent" from the bulk call alone.
// We enrich each candidate with tl.getLastExecutionResult (one extra call per
// (test case, plan) pair that has any execution) to get execution_ts/tester_id,
// then pick the genuinely most recent one. That enrichment call is wrapped
// defensively — if it's unavailable, the entry is kept with status intact but
// no date/tester, rather than dropping the execution entirely.
async function buildExecutionLookup(call, planNames, testProjectId) {
  const allPlans = normalizeToArray(await call("tl.getProjectTestPlans", { testprojectid: testProjectId }));
  const targetPlans = planNames.length ? allPlans.filter((p) => planNames.includes(p.name)) : allPlans;

  if (planNames.length) {
    const missing = planNames.filter((name) => !allPlans.some((p) => p.name === name));
    if (missing.length) console.warn(`TestLink: test plan(s) not found in this project: ${missing.join(", ")}`);
  }
  if (targetPlans.length === 0) return { execByTcId: {}, buildNameById: {} };

  const buildNameById = {};
  const candidatesByTcId = {};

  await Promise.all(
    targetPlans.map(async (plan) => {
      const [casesForPlan, builds] = await Promise.all([
        call("tl.getTestCasesForTestPlan", { testplanid: plan.id }),
        call("tl.getBuildsForTestPlan", { testplanid: plan.id }).catch(() => []),
      ]);
      normalizeToArray(builds).forEach((b) => {
        buildNameById[String(b.id)] = b.name;
      });

      for (const entries of Object.values(casesForPlan || {})) {
        const list = normalizeToArray(entries);
        if (list.length === 0) continue;
        const entry = list[0]; // most recent within this plan
        const tcId = entry.tcase_id ?? entry.testcase_id;
        (candidatesByTcId[tcId] ||= []).push({ ...entry, _planId: plan.id });
      }
    })
  );

  const execByTcId = {};
  await Promise.all(
    Object.entries(candidatesByTcId).map(async ([tcId, candidates]) => {
      const enriched = await Promise.all(
        candidates.map(async (entry) => {
          try {
            const [detail] = normalizeToArray(await call("tl.getLastExecutionResult", { testplanid: entry._planId, testcaseid: Number(tcId) }));
            return { ...entry, execution_ts: detail?.execution_ts, tester_id: detail?.tester_id };
          } catch {
            return entry; // enrichment unavailable — keep status/build, skip date/tester
          }
        })
      );
      execByTcId[tcId] = enriched.reduce((best, e) => ((e.execution_ts || "") > (best.execution_ts || "") ? e : best), enriched[0]);
    })
  );

  return { execByTcId, buildNameById };
}

async function extractAutomationFlag(call, tc, automationKeyword) {
  if (!automationKeyword) return false; // no keyword configured -> nothing to match against
  // Prefer keywords already embedded on the test case (some installs'
  // "simple" details include them); fall back to a dedicated call otherwise.
  if (tc.keywords) {
    const text = (typeof tc.keywords === "string" ? tc.keywords : Object.values(tc.keywords).join(",")).toLowerCase();
    return text.includes(automationKeyword);
  }
  try {
    const kw = await call("tl.getTestCaseKeywords", { testcaseid: tc.id });
    const list = normalizeToArray(kw);
    const text = list.map((k) => (typeof k === "string" ? k : k.keyword || k.notes || "")).join(",").toLowerCase();
    return text.includes(automationKeyword);
  } catch (e) {
    if (!keywordsApiWarned) {
      keywordsApiWarned = true;
      console.warn(`TestLink: tl.getTestCaseKeywords is unavailable on this install (${e.message}) — defaulting all test cases to "Manual".`);
    }
    return false;
  }
}

async function extractScriptPath(call, tc, project, cfg) {
  if (!cfg.scriptPathField) return null;
  try {
    const value = await call("tl.getTestCaseCustomFieldDesignValue", {
      testcaseexternalid: tc.full_external_id || `${project.prefix}${tc.tc_external_id || tc.id}`,
      version: tc.version || 1,
      testprojectid: project.id,
      customfieldname: cfg.scriptPathField,
      details: "value",
    });
    return value || null;
  } catch {
    return null; // custom field not configured on this install — not fatal
  }
}

async function extractLinkedJiraIds(call, tc) {
  try {
    const reqs = normalizeToArray(await call("tl.getReqsForTestCase", { testcaseid: tc.id }));
    return [...new Set(reqs.map((r) => r.doc_id).filter((id) => /^[A-Z][A-Z0-9]*-\d+$/.test(id || "")))];
  } catch {
    return []; // Requirements feature not enabled on this install — not fatal
  }
}

async function fetchProjectTestCases(call, project, cfg) {
  const suites = await collectSuites(call, project.id);
  const { execByTcId, buildNameById } = await buildExecutionLookup(call, cfg.testPlanNames, project.id);

  const results = [];
  for (const suite of suites) {
    const rawCases = normalizeToArray(await call("tl.getTestCasesForTestSuite", { testsuiteid: suite.id, deep: false, details: "simple" }));

    const mapped = await Promise.all(
      rawCases.map(async (tc) => {
        const exec = execByTcId[tc.id];
        const [scriptPath, linkedJiraIds, isAutomated] = await Promise.all([
          extractScriptPath(call, tc, project, cfg),
          extractLinkedJiraIds(call, tc),
          extractAutomationFlag(call, tc, cfg.automationKeyword),
        ]);
        // "simple" details (the only reliable option — see note above) does
        // not include the external id/version pair, but the test-plan
        // execution entry sometimes does (it's a different TestLink code
        // path) — prefer that, then fall back to project prefix + internal id.
        const id = exec?.full_external_id || tc.full_external_id || (tc.tc_external_id ? `${project.prefix}${tc.tc_external_id}` : `${project.prefix}${tc.id}`);
        return {
          id,
          title: tc.name,
          suite: suite.topName,
          type: isAutomated ? "Automated" : "Manual",
          status: exec ? mapExecStatus(exec.exec_status || exec.status) : "Not Run",
          execution_date: exec?.execution_ts || null,
          assigned_tester: exec?.tester_id ? `Tester #${exec.tester_id}` : "Unassigned",
          build_version: exec?.exec_on_build ? buildNameById[String(exec.exec_on_build)] || "" : "",
          linked_jira_ids: linkedJiraIds,
          automation_script_path: scriptPath,
          source: "testlink",
          // TestLink's execution status is a single-char code (p/f/b/...) —
          // shown as-is, the canonical `status` above is the human label.
          status_raw: exec ? exec.exec_status || exec.status || null : null,
        };
      })
    );

    results.push(...mapped);
  }
  return results;
}

export async function fetchTestLinkTestCases(cfg) {
  const { call } = createTestLinkClient(cfg.baseUrl, cfg.devKey);

  const allProjects = normalizeToArray(await call("tl.getProjects"));
  let targetProjects = allProjects;

  if (cfg.projectNames.length) {
    targetProjects = allProjects.filter((p) => cfg.projectNames.includes(p.name));
    const missing = cfg.projectNames.filter((name) => !allProjects.some((p) => p.name === name));
    if (missing.length) {
      console.warn(`TestLink: project(s) not found: ${missing.join(", ")}. Available: ${allProjects.map((p) => p.name).join(", ")}`);
    }
    if (targetProjects.length === 0) {
      throw new Error(`None of the configured TestLink projects were found. Available: ${allProjects.map((p) => p.name).join(", ")}`);
    }
  }

  const perProject = await Promise.all(targetProjects.map((project) => fetchProjectTestCases(call, project, cfg)));
  return perProject.flat();
}
