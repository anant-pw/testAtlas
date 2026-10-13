// Contract tests for the HTTP-based test-case adapters: each must turn its
// tool's response into the Normalised TestCase Schema. See tests/helpers.js
// for what the fixtures are and are not.
//
// TestLink and Kiwi TCMS speak XML-RPC through the `xmlrpc` client rather
// than fetch, so they are not covered here; both were run against real
// instances (see README).
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertTestCaseShape, stubFetch, byId } from "./helpers.js";
import { fetchTestRailTestCases } from "../src/adapters/testrailAdapter.js";
import { fetchZephyrScaleTestCases } from "../src/adapters/zephyrScaleAdapter.js";
import { fetchQTestTestCases } from "../src/adapters/qtestAdapter.js";
import { fetchPractiTestTestCases } from "../src/adapters/practitestAdapter.js";
import { fetchAzureDevopsTestPlans } from "../src/adapters/azureDevopsTestPlansAdapter.js";

// ------------------------------------------------------------ TestRail
test("testrail: the newest run decides each case's status", async (t) => {
  stubFetch(t, [
    ["get_suites/1", [{ id: 10, name: "Checkout" }]],
    ["get_case_types", [{ id: 1, name: "Automated" }, { id: 2, name: "Functional" }]],
    ["get_statuses", [{ id: 1, label: "Passed" }, { id: 5, label: "Failed" }, { id: 2, label: "Blocked" }]],
    ["get_cases/1", { cases: [
      { id: 100, title: "Pay by card", suite_id: 10, type_id: 1 },
      { id: 101, title: "Pay by voucher", suite_id: 10, type_id: 2 },
      { id: 102, title: "Never run", suite_id: 10, type_id: 2 },
    ] }],
    ["get_runs/1", { runs: [{ id: 7, name: "Build 41" }, { id: 8, name: "Build 42" }] }],
    ["get_tests/8", { tests: [{ case_id: 100, status_id: 5, completed_on: 1767225600 }] }],
    ["get_tests/7", { tests: [{ case_id: 100, status_id: 1, completed_on: 1767139200 }, { case_id: 101, status_id: 2 }] }],
  ]);

  const cases = await fetchTestRailTestCases({ baseUrl: "https://acme.testrail.io", email: "qa@example.com", apiKey: "key", projectId: "1" });
  cases.forEach((tc) => assertTestCaseShape(tc, "testrail"));
  const { C100: card, C101: voucher, C102: neverRun } = byId(cases);

  assert.equal(card.type, "Automated");
  assert.equal(card.status, "Failed", "run 8 is newer than run 7, so its result wins");
  assert.equal(card.status_raw, "Failed");
  assert.equal(card.build_version, "Build 42");
  assert.equal(card.execution_date, "2026-01-01 00:00:00");
  assert.equal(card.suite, "Checkout");

  assert.equal(voucher.type, "Manual");
  assert.equal(voucher.status, "Blocked");
  assert.equal(voucher.execution_date, null, "no completion time means no execution date");

  assert.equal(neverRun.status, "Not Run");
  assert.equal(neverRun.status_raw, null);
});

// -------------------------------------------------------- Zephyr Scale
test("zephyr_scale: uses the latest execution and the automation label", async (t) => {
  stubFetch(t, [
    ["/testcases?projectKey=WEB", { isLast: true, values: [
      { key: "WEB-T1", name: "Login", folder: { name: "Auth" }, labels: ["Automated-UI"] },
      { key: "WEB-T2", name: "Logout", labels: [] },
    ] }],
    ["/testexecutions?projectKey=WEB", { isLast: true, values: [
      { testCaseKey: "WEB-T1", testExecutionStatus: { name: "Pass" }, actualEndDate: "2026-05-01T10:00:00Z", testCycleKey: "WEB-R1", executedById: "abc" },
      { testCaseKey: "WEB-T1", testExecutionStatus: { name: "Fail" }, actualEndDate: "2026-05-03T10:00:00Z", testCycleKey: "WEB-R2", executedById: "abc" },
    ] }],
  ]);

  const cases = await fetchZephyrScaleTestCases({ baseUrl: "https://api.zephyrscale.smartbear.com/v2", apiToken: "token", projectKey: "WEB", automationKeyword: "automated" });
  cases.forEach((tc) => assertTestCaseShape(tc, "zephyr_scale"));
  const { "WEB-T1": login, "WEB-T2": logout } = byId(cases);

  assert.equal(login.type, "Automated");
  assert.equal(login.status, "Failed", "the later execution wins");
  assert.equal(login.build_version, "WEB-R2");
  assert.equal(login.suite, "Auth");

  assert.equal(logout.type, "Manual");
  assert.equal(logout.status, "Not Run");
  assert.equal(logout.suite, "", "a case with no folder has no suite");
});

// --------------------------------------------------------------- qTest
test("qtest: maps cases with their most recent run", async (t) => {
  stubFetch(t, [
    ["/modules?", { items: [{ id: 3, name: "Payments" }] }],
    ["/test-cases?", { items: [
      { id: 50, pid: "TC-50", name: "Refund", parent_id: 3, properties: [{ field_name: "Automation", field_value_name: "Yes - automated" }] },
      { id: 51, name: "Chargeback", parent_id: 99, properties: [] },
    ] }],
    ["/test-runs?", { items: [
      { test_case: { id: 50 }, status: { name: "Passed" }, actual_execution_date: "2026-05-02T08:00:00Z", assigned_to_name: "Alex Kim" },
      { test_case: { id: 50 }, status: { name: "Incomplete" }, actual_execution_date: "2026-05-01T08:00:00Z" },
      { status: { name: "Failed" } }, // a run with no test case reference is ignored
    ] }],
  ]);

  const cases = await fetchQTestTestCases({ baseUrl: "https://acme.qtestnet.com", token: "token", projectId: "9", automationKeyword: "automated" });
  cases.forEach((tc) => assertTestCaseShape(tc, "qtest"));
  const { "TC-50": refund, "QT-51": chargeback } = byId(cases);

  assert.equal(refund.type, "Automated");
  assert.equal(refund.status, "Passed");
  assert.equal(refund.assigned_tester, "Alex Kim");
  assert.equal(refund.suite, "Payments");

  assert.equal(chargeback.status, "Not Run");
  assert.equal(chargeback.suite, "", "an unknown parent module gives an empty suite");
});

// ---------------------------------------------------------- PractiTest
test("practitest: joins runs to tests through instances", async (t) => {
  stubFetch(t, [
    ["/tests.json", { data: [
      { id: "1", attributes: { name: "Search", tags: ["Catalog"], "automation-type": "Selenium" } },
      { id: "2", attributes: { name: "Filter", tags: [] } },
    ] }],
    ["/instances.json", { data: [{ id: "900", relationships: { test: { data: { id: "1" } } } }] }],
    ["/runs.json", { data: [
      { id: "r1", attributes: { "instance-id": "900", status: "FAILED", "executed-at": "2026-05-04T09:00:00Z", "tester-name": "Jo Diaz" } },
      { id: "r2", attributes: { "instance-id": "777", status: "PASSED", "executed-at": "2026-05-05T09:00:00Z" } }, // unknown instance: ignored
    ] }],
  ]);

  const cases = await fetchPractiTestTestCases({ baseUrl: "https://api.practitest.com", email: "qa@example.com", apiToken: "token", projectId: "4" });
  cases.forEach((tc) => assertTestCaseShape(tc, "practitest"));
  const { "PT-1": search, "PT-2": filter } = byId(cases);

  assert.equal(search.type, "Automated");
  assert.equal(search.status, "Failed");
  assert.equal(search.assigned_tester, "Jo Diaz");
  assert.equal(search.suite, "Catalog");

  assert.equal(filter.type, "Manual");
  assert.equal(filter.status, "Not Run");
});

// ----------------------------------------------- Azure DevOps Test Plans
test("azure_devops_testplans: de-duplicates a case across suites and keeps the worst result", async (t) => {
  const testCase = (id, name, fields = []) => ({ workItem: { id, name, workItemFields: fields } });
  stubFetch(t, [
    ["/suites/20/testcase", { value: [testCase(300, "Add to cart", [{ "Microsoft.VSTS.TCM.AutomationStatus": "Automated" }, { "Microsoft.VSTS.TCM.AutomatedTestName": "cart.spec.add" }])] }],
    ["/suites/20/testpoint", { value: [{ testCaseReference: { id: 300 }, results: { outcome: "passed", completedDate: "2026-05-01T00:00:00Z" }, tester: { displayName: "Alex Kim" } }] }],
    ["/suites/21/testcase", { value: [testCase(300, "Add to cart"), testCase(301, "Remove from cart")] }],
    ["/suites/21/testpoint", { value: [{ testCaseReference: { id: 300 }, results: { outcome: "failed", completedDate: "2026-05-02T00:00:00Z" } }] }],
    ["/plans/1/suites", { value: [{ id: 20, name: "Smoke" }, { id: 21, name: "Regression" }] }],
    ["/testplan/plans?", { value: [{ id: 1, name: "Release 5" }] }],
  ]);

  const cases = await fetchAzureDevopsTestPlans({ org: "acme", project: "Shop", pat: "pat", baseUrl: "" });
  cases.forEach((tc) => assertTestCaseShape(tc, "azure_devops_testplans"));
  assert.equal(cases.length, 2, "case 300 appears in two suites but is reported once");
  const { "TC-300": add, "TC-301": remove } = byId(cases);

  assert.equal(add.type, "Automated");
  assert.equal(add.automation_script_path, "cart.spec.add");
  assert.equal(add.suite, "Smoke", "the first suite seen is kept");
  assert.equal(add.status, "Failed", "a failure in any suite outranks a pass");
  assert.equal(add.status_raw, "failed");
  assert.equal(add.build_version, "Release 5");

  assert.equal(remove.type, "Manual");
  assert.equal(remove.status, "Not Run");
});
