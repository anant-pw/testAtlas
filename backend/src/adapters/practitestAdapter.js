// PractiTest REST API v2 adapter (JSON:API format). Maps tests + their most
// recent run result to the Normalised TestCase Schema.
// Docs: https://www.practitest.com/api-v2/
//
// PractiTest's "suite" grouping and automation flag are usually org-specific
// custom fields rather than fixed attributes, much like TestLink/qTest/
// Zephyr in this codebase — verify the exact attribute names below
// (PRACTITEST_SUITE_FIELD-equivalent logic uses "tags" here) against your
// own instance before relying on this in production.

import { buildBasicAuthHeader } from "../lib/http.js";
import { paginate as paginateGeneric } from "../lib/pagination.js";

function paginate(url, headers) {
  return paginateGeneric({
    buildPageUrl: (page) => `${url}&page[number]=${page + 1}&page[size]=100`,
    headers,
    pageSize: 100,
    extractBatch: (data) => data.data || [],
    sourceName: "PractiTest",
  });
}

function mapRunStatus(status) {
  const s = (status || "").toUpperCase();
  if (s === "PASSED") return "Passed";
  if (s === "FAILED") return "Failed";
  if (s === "BLOCKED") return "Blocked";
  return "Not Run"; // N_A, PENDING, ...
}

function mapTest(test, ctx) {
  const attrs = test.attributes || {};
  const run = ctx.runByTestId[test.id];
  return {
    id: `PT-${test.id}`,
    title: attrs.name,
    suite: (attrs.tags || [])[0] || "",
    type: attrs["automation-type"] && attrs["automation-type"].toLowerCase() !== "manual" ? "Automated" : "Manual",
    status: run ? mapRunStatus(run.attributes?.status) : "Not Run",
    execution_date: run?.attributes?.["executed-at"] || null,
    assigned_tester: run?.attributes?.["tester-name"] || "Unassigned",
    build_version: "",
    linked_jira_ids: [],
    automation_script_path: null,
    source: "practitest",
    status_raw: run?.attributes?.status || null,
  };
}

export async function fetchPractiTestTestCases(cfg) {
  const headers = { Authorization: buildBasicAuthHeader(cfg.email, cfg.apiToken), Accept: "application/json" };
  const base = `${cfg.baseUrl}/api/v2/projects/${cfg.projectId}`;

  const [tests, instances, runs] = await Promise.all([
    paginate(`${base}/tests.json?`, headers),
    paginate(`${base}/instances.json?`, headers),
    paginate(`${base}/runs.json?`, headers),
  ]);

  const testIdByInstanceId = Object.fromEntries(
    instances.map((inst) => [inst.id, inst.relationships?.test?.data?.id]).filter(([, testId]) => testId)
  );

  const runByTestId = {};
  for (const run of runs) {
    const instanceId = run.attributes?.["instance-id"];
    const testId = testIdByInstanceId[instanceId];
    if (!testId) continue;
    const existing = runByTestId[testId];
    const runDate = run.attributes?.["executed-at"] || "";
    if (!existing || runDate > (existing.attributes?.["executed-at"] || "")) runByTestId[testId] = run;
  }

  const ctx = { runByTestId };
  return tests.map((t) => mapTest(t, ctx));
}
