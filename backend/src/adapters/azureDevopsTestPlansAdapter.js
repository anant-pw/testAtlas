// Azure DevOps Test Plans adapter.
// Fetches test cases + their most recent execution result from Azure Test Plans
// and maps each to the dashboard's Normalised TestCase Schema.
//
// Uses the same org/project/PAT as azureDevopsAdapter.js (Boards) —
// no extra credentials. Set TC_SOURCE = "azure_devops_testplans" in the
// dashboard and fill in the AZURE_DEVOPS_* vars in backend/.env.
//
// Docs:
//   Test Plans API: https://learn.microsoft.com/en-us/rest/api/azure/devops/testplan
//   Test Results:   https://learn.microsoft.com/en-us/rest/api/azure/devops/test

import { fetchJson, buildBasicAuthHeader } from "../lib/http.js";

const API_VERSION = "7.1";

function authHeader(cfg) {
  // Azure DevOps PAT auth: Basic base64(":{PAT}")
  return buildBasicAuthHeader("", cfg.pat);
}

function root(cfg) {
  return (cfg.baseUrl || "https://dev.azure.com").replace(/\/+$/, "");
}

function mapOutcome(outcome) {
  const o = (outcome || "").toLowerCase();
  if (o === "passed") return "Passed";
  if (o === "failed") return "Failed";
  if (o === "blocked") return "Blocked";
  return "Not Run"; // notExecuted, none, unspecified, paused, ...
}

export async function fetchAzureDevopsTestPlans(cfg) {
  const base = `${root(cfg)}/${cfg.org}/${encodeURIComponent(cfg.project)}/_apis`;
  const headers = { Authorization: authHeader(cfg), Accept: "application/json" };

  // 1. Fetch all test plans in the project.
  const plansData = await fetchJson(
    `${base}/testplan/plans?api-version=${API_VERSION}`,
    { headers, sourceName: "Azure Test Plans" }
  );
  const plans = plansData.value || [];

  // Accumulate test cases keyed by work item id so we de-duplicate cases
  // that appear in multiple suites or plans, keeping the richest result.
  const tcMap = new Map(); // workItemId (string) -> NormalisedTestCase

  for (const plan of plans) {
    // 2. Fetch all suites in this plan.
    const suitesData = await fetchJson(
      `${base}/testplan/plans/${plan.id}/suites?api-version=${API_VERSION}`,
      { headers, sourceName: "Azure Test Plans" }
    );
    const suites = suitesData.value || [];

    for (const suite of suites) {
      // 3. Fetch test cases in this suite.
      const casesData = await fetchJson(
        `${base}/testplan/plans/${plan.id}/suites/${suite.id}/testcase?api-version=${API_VERSION}`,
        { headers, sourceName: "Azure Test Plans" }
      ).catch(() => ({ value: [] }));

      for (const tc of casesData.value || []) {
        const wi = tc.workItem || {};
        // workItemFields is an array of single-key objects — merge into one map.
        const f = (wi.workItemFields || []).reduce((acc, obj) => Object.assign(acc, obj), {});
        const id = String(wi.id);

        if (!tcMap.has(id)) {
          const isAuto =
            (f["Microsoft.VSTS.TCM.AutomationStatus"] || "").toLowerCase() === "automated";
          tcMap.set(id, {
            id: `TC-${id}`,
            title: wi.name || f["System.Title"] || "",
            suite: suite.name || "",
            type: isAuto ? "Automated" : "Manual",
            status: "Not Run",
            execution_date: null,
            assigned_tester: f["System.AssignedTo"]?.displayName || "Unassigned",
            build_version: plan.name || "",
            linked_jira_ids: [],
            automation_script_path: f["Microsoft.VSTS.TCM.AutomatedTestName"] || null,
            source: "azure_devops_testplans",
            status_raw: null,
          });
        }
      }

      // 4. Fetch test points (case + plan + suite = one "point") to get the
      //    most recent execution outcome for each case in this suite.
      const pointsData = await fetchJson(
        `${base}/testplan/plans/${plan.id}/suites/${suite.id}/testpoint?api-version=${API_VERSION}`,
        { headers, sourceName: "Azure Test Plans" }
      ).catch(() => ({ value: [] }));

      for (const point of pointsData.value || []) {
        const id = String(point.testCaseReference?.id);
        const entry = tcMap.get(id);
        if (!entry || !point.results) continue;

        const outcome = mapOutcome(point.results.outcome);
        // Upgrade: prefer any executed status over "Not Run", and prefer
        // failed/blocked over passed so regressions are visible when the
        // same case has mixed results across suites.
        const rank = { "Not Run": 0, Passed: 1, Blocked: 2, Failed: 3 };
        if ((rank[outcome] ?? 0) >= (rank[entry.status] ?? 0)) {
          entry.status = outcome;
          entry.status_raw = point.results.outcome || null;
          entry.execution_date = point.results.completedDate || null;
          if (point.tester?.displayName) {
            entry.assigned_tester = point.tester.displayName;
          }
        }
      }
    }
  }

  return Array.from(tcMap.values());
}
