// TestRail API v2 adapter. Maps test cases + their most recent run result to
// the Normalised TestCase Schema. Docs: https://support.testrail.com/hub/en/articles/api

import { fetchJson, buildBasicAuthHeader } from "../lib/http.js";
import { paginate as paginateGeneric } from "../lib/pagination.js";

// TestRail's default status ids — installs can rename/add statuses, but
// these four ids are the out-of-the-box ones most instances keep.
function mapExecStatus(statusId) {
  if (statusId === 1) return "Passed";
  if (statusId === 5) return "Failed";
  if (statusId === 2) return "Blocked";
  return "Not Run"; // 3 = Untested, 4 = Retest, or no execution at all
}

// Paginates TestRail's offset/limit list endpoints, which return either a
// bare array (older instances) or { <key>: [...], _links: {...} } (newer).
function paginate(baseUrl, headers, key) {
  return paginateGeneric({
    buildPageUrl: (page) => `${baseUrl}&limit=250&offset=${page * 250}`,
    headers,
    pageSize: 250,
    extractBatch: (data) => (Array.isArray(data) ? data : data[key] || []),
    sourceName: "TestRail",
  });
}

function mapCase(testCase, ctx) {
  const exec = ctx.execByCaseId[testCase.id];
  const typeName = (ctx.typeById[testCase.type_id] || "").toLowerCase();
  return {
    id: `C${testCase.id}`,
    title: testCase.title,
    suite: ctx.suiteById[testCase.suite_id] || "",
    type: typeName.includes("automat") ? "Automated" : "Manual",
    status: exec ? mapExecStatus(exec.status_id) : "Not Run",
    execution_date: exec?.completed_on ? new Date(exec.completed_on * 1000).toISOString().slice(0, 19).replace("T", " ") : null,
    // TestRail's run/test objects only carry numeric user ids; resolving
    // those to names needs a separate get_user/{id} call per unique id,
    // which we skip here the same way the TestLink adapter does.
    assigned_tester: "Unassigned",
    build_version: exec?.runName || "",
    linked_jira_ids: [],
    automation_script_path: null,
    source: "testrail",
    // TestRail installs can rename/add statuses beyond the default four —
    // this is the install's own status label, looked up via get_statuses.
    status_raw: exec ? ctx.statusById[exec.status_id] || null : null,
  };
}

export async function fetchTestRailTestCases(cfg) {
  const headers = { Authorization: buildBasicAuthHeader(cfg.email, cfg.apiKey), Accept: "application/json" };

  const [suites, caseTypes, statuses, cases, runs] = await Promise.all([
    paginate(`${cfg.baseUrl}/index.php?/api/v2/get_suites/${cfg.projectId}`, headers, "suites"),
    fetchJson(`${cfg.baseUrl}/index.php?/api/v2/get_case_types`, { headers, sourceName: "TestRail" }),
    fetchJson(`${cfg.baseUrl}/index.php?/api/v2/get_statuses`, { headers, sourceName: "TestRail" }),
    paginate(`${cfg.baseUrl}/index.php?/api/v2/get_cases/${cfg.projectId}`, headers, "cases"),
    paginate(`${cfg.baseUrl}/index.php?/api/v2/get_runs/${cfg.projectId}`, headers, "runs"),
  ]);

  const suiteById = Object.fromEntries(suites.map((s) => [s.id, s.name]));
  const typeById = Object.fromEntries((Array.isArray(caseTypes) ? caseTypes : []).map((t) => [t.id, t.name]));
  const statusById = Object.fromEntries((Array.isArray(statuses) ? statuses : []).map((s) => [s.id, s.label || s.name]));

  // Most recently created run wins for any case it covers; runs are
  // processed newest-first so the first hit per case is the one kept.
  const sortedRuns = [...runs].sort((a, b) => b.id - a.id);
  const execByCaseId = {};
  for (const run of sortedRuns) {
    const tests = await paginate(`${cfg.baseUrl}/index.php?/api/v2/get_tests/${run.id}`, headers, "tests");
    for (const test of tests) {
      if (execByCaseId[test.case_id]) continue;
      execByCaseId[test.case_id] = { ...test, runName: run.name };
    }
  }

  const ctx = { suiteById, typeById, statusById, execByCaseId };
  return cases.map((c) => mapCase(c, ctx));
}
