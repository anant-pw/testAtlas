// qTest Manager REST API v3 adapter. Maps test cases + their most recent
// run result to the Normalised TestCase Schema.
// Docs: https://api.qasymphony.com/ (qTest Manager API v3)
//
// qTest's data model nests test runs under Release > Test Cycle > Test Suite,
// which varies a lot between orgs. This adapter uses the flatter
// project-level /test-runs listing instead of walking that hierarchy, which
// covers the common case but won't reflect cycle/release-scoped reporting.
// Likewise, qTest's "Module" (folder) tree can nest arbitrarily deep; we use
// a test case's direct parent module name as its "suite" rather than
// flattening the full path.

import { buildBearerAuthHeader } from "../lib/http.js";
import { paginate as paginateGeneric } from "../lib/pagination.js";

function paginate(url, headers) {
  return paginateGeneric({
    buildPageUrl: (page) => `${url}&page=${page + 1}&pageSize=100`,
    headers,
    pageSize: 100,
    extractBatch: (data) => data.items || [],
    sourceName: "qTest",
  });
}

function findProperty(properties, fieldName) {
  return (properties || []).find((p) => (p.field_name || "").toLowerCase() === fieldName.toLowerCase());
}

function mapRunStatus(statusName) {
  const s = (statusName || "").toLowerCase();
  if (s === "pass" || s === "passed") return "Passed";
  if (s === "fail" || s === "failed") return "Failed";
  if (s === "blocked") return "Blocked";
  return "Not Run"; // Incomplete, Not Run, Skipped, ...
}

function mapCase(testCase, ctx, automationKeyword) {
  const exec = ctx.runByCaseId[testCase.id];
  const automationProp = automationKeyword ? findProperty(testCase.properties, "Automation") : null;
  const isAutomated = automationProp ? (automationProp.field_value_name || "").toLowerCase().includes(automationKeyword) : false;

  return {
    id: testCase.pid || `QT-${testCase.id}`,
    title: testCase.name,
    suite: ctx.moduleById[testCase.parent_id] || "",
    type: isAutomated ? "Automated" : "Manual",
    status: exec ? mapRunStatus(exec.status?.name) : "Not Run",
    execution_date: exec?.actual_execution_date || null,
    assigned_tester: exec?.assigned_to_name || "Unassigned",
    build_version: "",
    linked_jira_ids: [],
    automation_script_path: null,
    source: "qtest",
    status_raw: exec?.status?.name || null,
  };
}

export async function fetchQTestTestCases(cfg) {
  const headers = { Authorization: buildBearerAuthHeader(cfg.token), Accept: "application/json" };
  const base = `${cfg.baseUrl}/api/v3/projects/${cfg.projectId}`;

  const [modules, cases, runs] = await Promise.all([
    paginate(`${base}/modules?`, headers),
    paginate(`${base}/test-cases?`, headers),
    paginate(`${base}/test-runs?`, headers),
  ]);

  const moduleById = Object.fromEntries(modules.map((m) => [m.id, m.name]));

  // Most recently executed run wins per test case.
  const runByCaseId = {};
  for (const run of runs) {
    const caseId = run.test_case?.id;
    if (!caseId) continue;
    const existing = runByCaseId[caseId];
    const runDate = run.actual_execution_date || "";
    if (!existing || runDate > (existing.actual_execution_date || "")) runByCaseId[caseId] = run;
  }

  const ctx = { moduleById, runByCaseId };
  return cases.map((c) => mapCase(c, ctx, cfg.automationKeyword));
}
