// Kiwi TCMS XML-RPC API adapter. Maps test cases + their most recent
// execution to the Normalised TestCase Schema.
// Docs: https://kiwitcms.readthedocs.io/en/latest/api/index.html
//
// Unlike TestLink, Kiwi TCMS test cases have a real `is_automated` boolean
// and a human-readable `summary` (its title field) — no keyword guessing
// needed for the automation flag here.

import { createKiwiClient } from "../lib/kiwiClient.js";

function normalizeToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function mapExecStatus(statusName) {
  const s = (statusName || "").toUpperCase();
  if (s === "PASSED") return "Passed";
  if (s === "FAILED" || s === "ERROR") return "Failed";
  if (s === "BLOCKED" || s === "WAIVED") return "Blocked";
  return "Not Run"; // IDLE, RUNNING
}

function mapCase(testCase, ctx) {
  const exec = ctx.execByCaseId[testCase.id];
  const statusRaw = exec ? ctx.statusNameById[exec.status] || exec.status?.name : null;
  return {
    id: `TC-${testCase.id}`,
    title: testCase.summary,
    suite: testCase.category__name || "",
    type: testCase.is_automated ? "Automated" : "Manual",
    status: exec ? mapExecStatus(statusRaw) : "Not Run",
    execution_date: exec?.stop_date || null,
    assigned_tester: exec?.tested_by__username || exec?.assignee__username || "Unassigned",
    build_version: exec?.build__name || "",
    linked_jira_ids: [],
    automation_script_path: null,
    source: "kiwi_tcms",
    status_raw: statusRaw || null,
  };
}

export async function fetchKiwiTcmsTestCases(cfg) {
  const { call } = await createKiwiClient(cfg.baseUrl, cfg.username, cfg.apiToken, cfg.allowSelfSigned);

  const filter = cfg.productName ? { category__product__name: cfg.productName } : {};
  const cases = normalizeToArray(await call("TestCase.filter", filter));

  const execFilter = cfg.productName ? { case__category__product__name: cfg.productName } : {};
  const executions = normalizeToArray(await call("TestExecution.filter", execFilter));

  // Kiwi TCMS may return `status` as a plain id (older API serializers) or
  // an expanded {id, name} object (newer ones) — fetch the lookup table only
  // if we actually need to resolve bare ids.
  const needsStatusLookup = executions.some((e) => typeof e.status === "number");
  const statusNameById = needsStatusLookup
    ? Object.fromEntries(normalizeToArray(await call("TestExecutionStatus.filter", {})).map((s) => [s.id, s.name]))
    : {};

  const execByCaseId = {};
  for (const exec of executions) {
    const caseId = exec.case;
    const existing = execByCaseId[caseId];
    const execDate = exec.stop_date || "";
    if (!existing || execDate > (existing.stop_date || "")) execByCaseId[caseId] = exec;
  }

  const ctx = { execByCaseId, statusNameById };
  return cases.map((c) => mapCase(c, ctx));
}
