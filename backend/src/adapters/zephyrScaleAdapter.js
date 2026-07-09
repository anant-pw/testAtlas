// Zephyr Scale (Cloud, for Jira) REST API v2 adapter. Maps test cases +
// their most recent execution to the Normalised TestCase Schema.
// Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/

import { buildBearerAuthHeader } from "../lib/http.js";
import { paginate as paginateGeneric } from "../lib/pagination.js";

function mapExecStatus(statusName) {
  const s = (statusName || "").toLowerCase();
  if (s === "pass" || s === "passed") return "Passed";
  if (s === "fail" || s === "failed") return "Failed";
  if (s === "blocked") return "Blocked";
  return "Not Run"; // Not Executed, In Progress, custom statuses
}

// Zephyr Scale has no single canonical "is this automated" field across
// orgs — same convention as TestLink/qTest: an "automated" label.
function isAutomated(labels, keyword) {
  if (!keyword) return false;
  return (labels || []).some((l) => l.toLowerCase().includes(keyword));
}

function paginate(url, headers) {
  return paginateGeneric({
    buildPageUrl: (page) => `${url}&maxResults=100&startAt=${page * 100}`,
    headers,
    extractBatch: (data) => data.values || [],
    isLastPage: (data, batch) => data.isLast || batch.length < 100,
    sourceName: "Zephyr Scale",
  });
}

function mapCase(testCase, exec, automationKeyword) {
  return {
    id: testCase.key,
    title: testCase.name,
    suite: testCase.folder?.name || "",
    type: isAutomated(testCase.labels, automationKeyword) ? "Automated" : "Manual",
    status: exec ? mapExecStatus(exec.testExecutionStatus?.name) : "Not Run",
    execution_date: exec?.actualEndDate || null,
    // executedById/owner are Jira account ids — resolving to a display name
    // needs a separate Jira user-lookup call per unique id, which we skip.
    assigned_tester: exec?.executedById ? `User ${exec.executedById}` : "Unassigned",
    build_version: exec?.testCycleKey || "",
    linked_jira_ids: [],
    automation_script_path: null,
    source: "zephyr_scale",
    status_raw: exec?.testExecutionStatus?.name || null,
  };
}

export async function fetchZephyrScaleTestCases(cfg) {
  const headers = { Authorization: buildBearerAuthHeader(cfg.apiToken), Accept: "application/json" };

  const [cases, executions] = await Promise.all([
    paginate(`${cfg.baseUrl}/testcases?projectKey=${cfg.projectKey}`, headers),
    paginate(`${cfg.baseUrl}/testexecutions?projectKey=${cfg.projectKey}`, headers),
  ]);

  const execByCaseKey = {};
  for (const exec of executions) {
    const key = exec.testCaseKey;
    const existing = execByCaseKey[key];
    if (!existing || (exec.actualEndDate || "") > (existing.actualEndDate || "")) execByCaseKey[key] = exec;
  }

  return cases.map((c) => mapCase(c, execByCaseKey[c.key], cfg.automationKeyword));
}
