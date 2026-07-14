import "dotenv/config";

function bool(v) {
  return v != null && v !== "";
}

// Comma-separated list -> trimmed, non-empty array. An unset/blank env var
// means "no filter" (the adapter then targets every project/plan it can see).
function list(v) {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 8001,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  // Shared secret the dashboard sends on every request (X-API-Key header).
  // This is a defense-in-depth layer for an internal/VPN-perimeter deployment,
  // not a real secret boundary — it ships to the browser, so anyone who can
  // open the dashboard's dev tools can read it. Leave blank to disable the
  // check entirely (e.g. local dev, or when network-level access control is
  // the actual security boundary).
  apiKey: process.env.BACKEND_API_KEY || "",

  jira: {
    baseUrl: (process.env.JIRA_BASE_URL || "").replace(/\/+$/, ""),
    email: process.env.JIRA_EMAIL || "",
    apiToken: process.env.JIRA_API_TOKEN || "",
    personalAccessToken: process.env.JIRA_PERSONAL_ACCESS_TOKEN || "",
    jql: process.env.JIRA_JQL || "",
    searchPath: process.env.JIRA_SEARCH_PATH || "/rest/api/3/search/jql",
    sprintField: process.env.JIRA_SPRINT_FIELD || "",
    tcLinkField: process.env.JIRA_TC_LINK_FIELD || "",
  },

  testlink: {
    baseUrl: (process.env.TESTLINK_BASE_URL || "").replace(/\/+$/, ""),
    devKey: process.env.TESTLINK_DEV_KEY || "",
    // Empty = every project/test plan the dev key can see, not just one.
    projectNames: list(process.env.TESTLINK_PROJECT_NAME),
    testPlanNames: list(process.env.TESTLINK_TEST_PLAN_NAME),
    automationKeyword: (process.env.TESTLINK_AUTOMATION_KEYWORD || "").toLowerCase().trim(),
    scriptPathField: process.env.TESTLINK_SCRIPT_PATH_FIELD || "",
  },

  // --- Additional defect-tracker sources (DEFECT_SOURCE alternatives) ---
  azureDevops: {
    org: process.env.AZURE_DEVOPS_ORG || "",
    project: process.env.AZURE_DEVOPS_PROJECT || "",
    pat: process.env.AZURE_DEVOPS_PAT || "",
    wiql: process.env.AZURE_DEVOPS_WIQL || "",
    // Override for Azure DevOps Server (on-prem). Leave blank for Cloud.
    baseUrl: (process.env.AZURE_DEVOPS_BASE_URL || "").replace(/\/+$/, ""),
  },
  bugzilla: {
    baseUrl: (process.env.BUGZILLA_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: process.env.BUGZILLA_API_KEY || "",
    product: process.env.BUGZILLA_PRODUCT || "",
    // Caps how many bugs get pulled, newest-changed-first — protects against
    // accidentally paginating through an entire large public tracker.
    maxResults: Number(process.env.BUGZILLA_MAX_RESULTS) || 200,
  },
  mantis: {
    baseUrl: (process.env.MANTIS_BASE_URL || "").replace(/\/+$/, ""),
    apiToken: process.env.MANTIS_API_TOKEN || "",
    projectId: process.env.MANTIS_PROJECT_ID || "",
  },
  githubIssues: {
    owner: process.env.GITHUB_OWNER || "",
    repo: process.env.GITHUB_REPO || "",
    token: process.env.GITHUB_TOKEN || "",
    // Override for GitHub Enterprise Server. Leave blank for github.com.
    baseUrl: (process.env.GITHUB_API_BASE_URL || "").replace(/\/+$/, ""),
    // Caps how many issues get pulled, newest-updated-first.
    maxResults: Number(process.env.GITHUB_MAX_RESULTS) || 200,
  },
  linear: {
    apiKey: process.env.LINEAR_API_KEY || "",
    teamKey: process.env.LINEAR_TEAM_KEY || "",
    baseUrl: process.env.LINEAR_API_BASE_URL || "",
  },

  // --- Additional test-case-management sources (TC_SOURCE alternatives) ---
  testrail: {
    baseUrl: (process.env.TESTRAIL_BASE_URL || "").replace(/\/+$/, ""),
    email: process.env.TESTRAIL_EMAIL || "",
    apiKey: process.env.TESTRAIL_API_KEY || "",
    projectId: process.env.TESTRAIL_PROJECT_ID || "",
  },
  qtest: {
    baseUrl: (process.env.QTEST_BASE_URL || "").replace(/\/+$/, ""),
    token: process.env.QTEST_BEARER_TOKEN || "",
    projectId: process.env.QTEST_PROJECT_ID || "",
    // qTest has no built-in automation flag — same convention as TestLink:
    // checks a custom "Automation" field for this value. Leave blank to skip.
    automationKeyword: (process.env.QTEST_AUTOMATION_KEYWORD || "").toLowerCase().trim(),
  },
  zephyrScale: {
    baseUrl: (process.env.ZEPHYR_BASE_URL || "https://api.zephyrscale.smartbear.com/v2").replace(/\/+$/, ""),
    apiToken: process.env.ZEPHYR_API_TOKEN || "",
    projectKey: process.env.ZEPHYR_PROJECT_KEY || "",
    automationKeyword: (process.env.ZEPHYR_AUTOMATION_KEYWORD || "").toLowerCase().trim(),
  },
  practitest: {
    baseUrl: (process.env.PRACTITEST_BASE_URL || "https://api.practitest.com").replace(/\/+$/, ""),
    email: process.env.PRACTITEST_EMAIL || "",
    apiToken: process.env.PRACTITEST_API_TOKEN || "",
    projectId: process.env.PRACTITEST_PROJECT_ID || "",
  },
  kiwiTcms: {
    baseUrl: (process.env.KIWI_BASE_URL || "").replace(/\/+$/, ""),
    username: process.env.KIWI_USERNAME || "",
    apiToken: process.env.KIWI_API_TOKEN || "",
    productName: process.env.KIWI_PRODUCT_NAME || "",
    // Only for local/self-signed HTTPS instances you control — never enable
    // this against a real internet-facing server, since it disables TLS
    // certificate validation entirely.
    allowSelfSigned: /^true$/i.test(process.env.KIWI_ALLOW_SELF_SIGNED || ""),
  },
};

export function isJiraConfigured() {
  const j = config.jira;
  const hasAuth = bool(j.personalAccessToken) || (bool(j.email) && bool(j.apiToken));
  return bool(j.baseUrl) && hasAuth && bool(j.jql);
}

export function isTestLinkConfigured() {
  const t = config.testlink;
  return bool(t.baseUrl) && bool(t.devKey);
}

export function isAzureDevopsConfigured() {
  const c = config.azureDevops;
  return bool(c.org) && bool(c.project) && bool(c.pat);
}

// Azure DevOps Test Plans uses the same org/project/PAT as Azure Boards —
// no extra credentials needed. A user pointing DEFECT_SOURCE at azure_devops
// and TC_SOURCE at azure_devops_testplans fills in the same env block once.
export function isAzureDevopsTestPlansConfigured() {
  return isAzureDevopsConfigured();
}

export function isBugzillaConfigured() {
  // apiKey is optional — public instances like bugzilla.mozilla.org allow
  // anonymous read access to public bugs.
  return bool(config.bugzilla.baseUrl);
}

export function isMantisConfigured() {
  const c = config.mantis;
  return bool(c.baseUrl) && bool(c.apiToken) && bool(c.projectId);
}

export function isGithubIssuesConfigured() {
  // token is optional — public repos work unauthenticated, just rate-limited.
  const c = config.githubIssues;
  return bool(c.owner) && bool(c.repo);
}

export function isLinearConfigured() {
  const c = config.linear;
  return bool(c.apiKey) && bool(c.teamKey);
}

export function isTestRailConfigured() {
  const c = config.testrail;
  return bool(c.baseUrl) && bool(c.email) && bool(c.apiKey) && bool(c.projectId);
}

export function isQTestConfigured() {
  const c = config.qtest;
  return bool(c.baseUrl) && bool(c.token) && bool(c.projectId);
}

export function isZephyrScaleConfigured() {
  const c = config.zephyrScale;
  return bool(c.apiToken) && bool(c.projectKey);
}

export function isPractiTestConfigured() {
  const c = config.practitest;
  return bool(c.email) && bool(c.apiToken) && bool(c.projectId);
}

export function isKiwiTcmsConfigured() {
  const c = config.kiwiTcms;
  return bool(c.baseUrl) && bool(c.username) && bool(c.apiToken);
}
