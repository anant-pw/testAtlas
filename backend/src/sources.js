// Single registry of every defect/TC source — replaces what used to be 12
// near-identical route files (jiraRoutes.js, bugzillaRoutes.js, ...). Adding
// a new source is now one entry here instead of a new route file plus a new
// server.js mount line. resource/isConfigured/fetchData/missingConfigMessage
// are exactly what each removed route file used to hard-code.

import {
  config,
  isJiraConfigured,
  isAzureDevopsConfigured,
  isAzureDevopsTestPlansConfigured,
  isBugzillaConfigured,
  isMantisConfigured,
  isGithubIssuesConfigured,
  isLinearConfigured,
  isTestLinkConfigured,
  isTestRailConfigured,
  isQTestConfigured,
  isZephyrScaleConfigured,
  isPractiTestConfigured,
  isKiwiTcmsConfigured,
} from "./config.js";
import { fetchJiraTickets } from "./adapters/jiraAdapter.js";
import { fetchAzureDevopsTickets } from "./adapters/azureDevopsAdapter.js";
import { fetchBugzillaTickets } from "./adapters/bugzillaAdapter.js";
import { fetchMantisTickets } from "./adapters/mantisAdapter.js";
import { fetchGithubIssuesTickets } from "./adapters/githubIssuesAdapter.js";
import { fetchLinearTickets } from "./adapters/linearAdapter.js";
import { fetchTestLinkTestCases } from "./adapters/testlinkAdapter.js";
import { fetchTestRailTestCases } from "./adapters/testrailAdapter.js";
import { fetchQTestTestCases } from "./adapters/qtestAdapter.js";
import { fetchZephyrScaleTestCases } from "./adapters/zephyrScaleAdapter.js";
import { fetchPractiTestTestCases } from "./adapters/practitestAdapter.js";
import { fetchKiwiTcmsTestCases } from "./adapters/kiwiTcmsAdapter.js";
import { fetchAzureDevopsTestPlans } from "./adapters/azureDevopsTestPlansAdapter.js";

export const TICKET_SOURCES = [
  {
    key: "jira",
    resource: "tickets",
    isConfigured: isJiraConfigured,
    fetchData: () => fetchJiraTickets(config.jira),
    missingConfigMessage:
      "Jira is not configured. Set JIRA_BASE_URL, JIRA_JQL, and either JIRA_PERSONAL_ACCESS_TOKEN or JIRA_EMAIL + JIRA_API_TOKEN in backend/.env.",
  },
  {
    key: "azure_devops",
    resource: "tickets",
    isConfigured: isAzureDevopsConfigured,
    fetchData: () => fetchAzureDevopsTickets(config.azureDevops),
    missingConfigMessage: "Azure DevOps is not configured. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT in backend/.env.",
  },
  {
    key: "bugzilla",
    resource: "tickets",
    isConfigured: isBugzillaConfigured,
    fetchData: () => fetchBugzillaTickets(config.bugzilla),
    missingConfigMessage: "Bugzilla is not configured. Set BUGZILLA_BASE_URL and BUGZILLA_API_KEY in backend/.env.",
  },
  {
    key: "mantis",
    resource: "tickets",
    isConfigured: isMantisConfigured,
    fetchData: () => fetchMantisTickets(config.mantis),
    missingConfigMessage: "Mantis is not configured. Set MANTIS_BASE_URL, MANTIS_API_TOKEN, and MANTIS_PROJECT_ID in backend/.env.",
  },
  {
    key: "github_issues",
    resource: "tickets",
    isConfigured: isGithubIssuesConfigured,
    fetchData: () => fetchGithubIssuesTickets(config.githubIssues),
    missingConfigMessage: "GitHub Issues is not configured. Set GITHUB_OWNER, GITHUB_REPO, and GITHUB_TOKEN in backend/.env.",
  },
  {
    key: "linear",
    resource: "tickets",
    isConfigured: isLinearConfigured,
    fetchData: () => fetchLinearTickets(config.linear),
    missingConfigMessage: "Linear is not configured. Set LINEAR_API_KEY and LINEAR_TEAM_KEY in backend/.env.",
  },
];

export const TEST_CASE_SOURCES = [
  {
    key: "testlink",
    resource: "testcases",
    isConfigured: isTestLinkConfigured,
    fetchData: () => fetchTestLinkTestCases(config.testlink),
    missingConfigMessage: "TestLink is not configured. Set TESTLINK_BASE_URL, TESTLINK_DEV_KEY, and TESTLINK_PROJECT_NAME in backend/.env.",
  },
  {
    key: "testrail",
    resource: "testcases",
    isConfigured: isTestRailConfigured,
    fetchData: () => fetchTestRailTestCases(config.testrail),
    missingConfigMessage: "TestRail is not configured. Set TESTRAIL_BASE_URL, TESTRAIL_EMAIL, TESTRAIL_API_KEY, and TESTRAIL_PROJECT_ID in backend/.env.",
  },
  {
    key: "qtest",
    resource: "testcases",
    isConfigured: isQTestConfigured,
    fetchData: () => fetchQTestTestCases(config.qtest),
    missingConfigMessage: "qTest is not configured. Set QTEST_BASE_URL, QTEST_BEARER_TOKEN, and QTEST_PROJECT_ID in backend/.env.",
  },
  {
    key: "zephyr_scale",
    resource: "testcases",
    isConfigured: isZephyrScaleConfigured,
    fetchData: () => fetchZephyrScaleTestCases(config.zephyrScale),
    missingConfigMessage: "Zephyr Scale is not configured. Set ZEPHYR_API_TOKEN and ZEPHYR_PROJECT_KEY in backend/.env.",
  },
  {
    key: "practitest",
    resource: "testcases",
    isConfigured: isPractiTestConfigured,
    fetchData: () => fetchPractiTestTestCases(config.practitest),
    missingConfigMessage: "PractiTest is not configured. Set PRACTITEST_EMAIL, PRACTITEST_API_TOKEN, and PRACTITEST_PROJECT_ID in backend/.env.",
  },
  {
    key: "kiwi_tcms",
    resource: "testcases",
    isConfigured: isKiwiTcmsConfigured,
    fetchData: () => fetchKiwiTcmsTestCases(config.kiwiTcms),
    missingConfigMessage: "Kiwi TCMS is not configured. Set KIWI_BASE_URL, KIWI_USERNAME, and KIWI_API_TOKEN in backend/.env.",
  },
  {
    key: "azure_devops_testplans",
    resource: "testcases",
    isConfigured: isAzureDevopsTestPlansConfigured,
    fetchData: () => fetchAzureDevopsTestPlans(config.azureDevops),
    // Same credentials as azure_devops (Boards) — no extra env vars needed.
    missingConfigMessage: "Azure DevOps Test Plans is not configured. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT in backend/.env (same as azure_devops).",
  },
];
