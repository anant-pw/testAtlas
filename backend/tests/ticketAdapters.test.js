// Contract tests for the six defect-tracker adapters: each must turn its
// tool's response into the Normalised Ticket Schema. See tests/helpers.js
// for what the fixtures are and are not.
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertTicketShape, stubFetch, byId } from "./helpers.js";
import { fetchJiraTickets } from "../src/adapters/jiraAdapter.js";
import { fetchBugzillaTickets } from "../src/adapters/bugzillaAdapter.js";
import { fetchAzureDevopsTickets } from "../src/adapters/azureDevopsAdapter.js";
import { fetchMantisTickets } from "../src/adapters/mantisAdapter.js";
import { fetchGithubIssuesTickets } from "../src/adapters/githubIssuesAdapter.js";
import { fetchLinearTickets } from "../src/adapters/linearAdapter.js";

// ---------------------------------------------------------------- Jira
const JIRA_CFG = {
  baseUrl: "https://example.atlassian.net", email: "qa@example.com", apiToken: "token",
  personalAccessToken: "", jql: "project = WEB", searchPath: "/rest/api/3/search/jql",
  sprintField: "customfield_10020", tcLinkField: "",
};

function jiraIssue(key, fields) {
  return {
    key,
    fields: {
      summary: `Summary of ${key}`,
      issuetype: { name: "Bug" },
      priority: { name: "High" },
      status: { name: "To Do", statusCategory: { key: "new" } },
      assignee: { displayName: "Alex Kim" },
      reporter: { displayName: "Sam Lee" },
      labels: [],
      ...fields,
    },
  };
}

test("jira: maps issues to the normalised ticket schema", async (t) => {
  stubFetch(t, [["/rest/api/3/search/jql", {
    isLast: true,
    issues: [
      jiraIssue("WEB-1", { priority: { name: "Highest" }, labels: ["TC-12", "sprint-4", "regression"] }),
      jiraIssue("WEB-2", { issuetype: { name: "Sub-task" }, priority: null, assignee: null, customfield_10020: [{ id: 7, name: "Sprint 9", state: "active" }] }),
    ],
  }]]);

  const tickets = await fetchJiraTickets(JIRA_CFG);
  tickets.forEach((ticket) => assertTicketShape(ticket, "jira"));
  const { "WEB-1": one, "WEB-2": two } = byId(tickets);

  assert.equal(one.priority, "Critical");
  assert.equal(one.priority_raw, "Highest");
  assert.deepEqual(one.linked_tc_ids, ["TC-12"], "a sprint-N label is a sprint, not a test case link");
  assert.equal(one.sprint, "Sprint 4", "sprint-N label is the fallback when there is no sprint field");

  assert.equal(two.type, "Task");
  assert.equal(two.type_raw, "Sub-task");
  assert.equal(two.priority, "Medium", "missing priority falls back to Medium");
  assert.equal(two.assignee, "Unassigned");
  assert.equal(two.sprint, "Sprint 9");
});

test("jira: status comes from the status category, not the workflow name", async (t) => {
  stubFetch(t, [["/rest/api/3/search/jql", {
    isLast: true,
    issues: [
      jiraIssue("WEB-1", { status: { name: "Won't Do", statusCategory: { key: "done" } } }),
      jiraIssue("WEB-2", { status: { name: "QA Sign-off", statusCategory: { key: "indeterminate" } } }),
      jiraIssue("WEB-3", { status: { name: "Resolved", statusCategory: { key: "done" } } }),
      jiraIssue("WEB-4", { status: { name: "Triage", statusCategory: { key: "new" } } }),
      jiraIssue("WEB-5", { status: { name: "In Review" } }), // no category: name fallback
    ],
  }]]);

  const tickets = byId(await fetchJiraTickets(JIRA_CFG));
  assert.equal(tickets["WEB-1"].status, "Closed", "a rejected ticket must not count as open");
  assert.equal(tickets["WEB-1"].status_raw, "Won't Do");
  assert.equal(tickets["WEB-2"].status, "In Progress");
  assert.equal(tickets["WEB-3"].status, "Resolved");
  assert.equal(tickets["WEB-4"].status, "Open");
  assert.equal(tickets["WEB-5"].status, "In Progress");
});

test("jira: follows nextPageToken until the last page", async (t) => {
  const calls = stubFetch(t, [
    [(url) => url.includes("nextPageToken=page2"), { isLast: true, issues: [jiraIssue("WEB-2", {})] }],
    ["/rest/api/3/search/jql", { nextPageToken: "page2", issues: [jiraIssue("WEB-1", {})] }],
  ]);

  const tickets = await fetchJiraTickets(JIRA_CFG);
  assert.deepEqual(tickets.map((ticket) => ticket.id), ["WEB-1", "WEB-2"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].init.headers.Authorization, /^Basic /);
});

// ------------------------------------------------------------ Bugzilla
test("bugzilla: maps bugs, including severity fallback and resolution", async (t) => {
  const calls = stubFetch(t, [["/rest/bug", {
    bugs: [
      { id: 101, summary: "Crash on save", status: "RESOLVED", resolution: "FIXED", priority: "P1", severity: "major",
        assigned_to: "dev@example.com", assigned_to_detail: { real_name: "Dev One" }, creator: "qa@example.com",
        creator_detail: { real_name: "QA One" }, keywords: ["TC-7", "regression"], target_milestone: "v2.1" },
      { id: 102, summary: "Add dark mode", status: "RESOLVED", resolution: "WONTFIX", priority: "--", severity: "enhancement",
        assigned_to: "nobody@example.com", creator: "qa@example.com", keywords: [], target_milestone: "---" },
      { id: 103, summary: "Data loss", status: "NEW", resolution: "", priority: "--", severity: "blocker",
        assigned_to: "dev@example.com", creator: "qa@example.com", keywords: [], target_milestone: "---" },
    ],
  }]]);

  const tickets = await fetchBugzillaTickets({ baseUrl: "https://bugs.example.org", apiKey: "", product: "", maxResults: 200 });
  tickets.forEach((ticket) => assertTicketShape(ticket, "bugzilla"));
  const { "BZ-101": fixed, "BZ-102": wontfix, "BZ-103": blocker } = byId(tickets);

  assert.equal(fixed.priority, "Critical");
  assert.equal(fixed.status, "Resolved");
  assert.equal(fixed.status_raw, "RESOLVED (FIXED)");
  assert.equal(fixed.assignee, "Dev One");
  assert.equal(fixed.sprint, "v2.1");
  assert.deepEqual(fixed.linked_tc_ids, ["TC-7"]);

  assert.equal(wontfix.type, "Improvement");
  assert.equal(wontfix.status, "Closed", "resolved but not fixed is closed, not resolved");
  assert.equal(wontfix.sprint, "", '"---" means no milestone');

  assert.equal(blocker.priority, "Critical", "severity is used when priority is unset");
  assert.equal(blocker.status, "Open");

  assert.equal(calls[0].init.headers["X-BUGZILLA-API-KEY"], undefined, "no key header when no key is configured");
});

// -------------------------------------------------------- Azure DevOps
test("azure_devops: runs the WIQL query, then maps the work items", async (t) => {
  const calls = stubFetch(t, [
    ["/_apis/wit/wiql", { workItems: [{ id: 11 }, { id: 12 }] }],
    ["/_apis/wit/workitems?ids=11,12", {
      value: [
        { id: 11, fields: { "System.Title": "Login fails", "System.WorkItemType": "Bug", "Microsoft.VSTS.Common.Priority": 1,
          "System.State": "Active", "System.AssignedTo": { displayName: "Alex Kim" }, "System.CreatedBy": { displayName: "Sam Lee" },
          "System.IterationPath": "Shop\\Release 1\\Sprint 3", "System.Tags": "TC-5; smoke" } },
        { id: 12, fields: { "System.Title": "Checkout redesign", "System.WorkItemType": "User Story", "Microsoft.VSTS.Common.Priority": 3,
          "System.State": "New", "System.IterationPath": "Shop" } },
      ],
    }],
  ]);

  const tickets = await fetchAzureDevopsTickets({ org: "acme", project: "Shop", pat: "pat", wiql: "", baseUrl: "" });
  tickets.forEach((ticket) => assertTicketShape(ticket, "azure_devops"));
  const { "Shop-11": bug, "Shop-12": story } = byId(tickets);

  assert.equal(bug.priority, "Critical");
  assert.equal(bug.priority_raw, "1");
  assert.equal(bug.status, "In Progress");
  assert.equal(bug.sprint, "Sprint 3", "the deepest iteration segment is the sprint");
  assert.deepEqual(bug.labels, ["TC-5", "smoke"]);
  assert.deepEqual(bug.linked_tc_ids, ["TC-5"]);

  assert.equal(story.type, "Story");
  assert.equal(story.status, "Open");
  assert.equal(story.sprint, "", "an iteration path that is only the project has no sprint");
  assert.equal(story.assignee, "Unassigned");

  assert.equal(calls[0].init.method, "POST");
});

test("azure_devops: returns no tickets without a second call when the query matches nothing", async (t) => {
  const calls = stubFetch(t, [["/_apis/wit/wiql", { workItems: [] }]]);
  assert.deepEqual(await fetchAzureDevopsTickets({ org: "acme", project: "Shop", pat: "pat" }), []);
  assert.equal(calls.length, 1);
});

// -------------------------------------------------------------- Mantis
test("mantis: maps issues to the normalised ticket schema", async (t) => {
  stubFetch(t, [["/api/rest/issues", {
    issues: [
      { id: 5, summary: "Export is slow", severity: { name: "major" }, priority: { name: "urgent" }, status: { name: "acknowledged" },
        handler: { name: "dev1", real_name: "Dev One" }, reporter: { name: "qa1" }, target_version: "3.0", tags: [{ name: "TC-9" }] },
      { id: 6, summary: "Bulk edit", severity: { name: "feature" }, priority: { name: "normal" }, status: { name: "closed" },
        reporter: { name: "qa1" } },
    ],
  }]]);

  const tickets = await fetchMantisTickets({ baseUrl: "https://mantis.example.org", apiToken: "token", projectId: "1" });
  tickets.forEach((ticket) => assertTicketShape(ticket, "mantis"));
  const { "MNT-5": bug, "MNT-6": feature } = byId(tickets);

  assert.equal(bug.priority, "Critical");
  assert.equal(bug.status, "In Progress");
  assert.equal(bug.assignee, "Dev One");
  assert.equal(bug.created_by, "qa1");
  assert.deepEqual(bug.linked_tc_ids, ["TC-9"]);

  assert.equal(feature.type, "Improvement");
  assert.equal(feature.status, "Closed");
  assert.equal(feature.assignee, "Unassigned");
});

// ------------------------------------------------------- GitHub Issues
test("github_issues: infers type and priority from labels and skips pull requests", async (t) => {
  const calls = stubFetch(t, [["/repos/acme/shop/issues", [
    { number: 1, title: "Cart total wrong", state: "open", labels: [{ name: "bug" }, { name: "priority: critical" }, { name: "TC-3" }],
      assignee: { login: "alex" }, user: { login: "sam" }, milestone: { title: "v1.2" } },
    { number: 2, title: "Old idea", state: "closed", state_reason: "not_planned", labels: [{ name: "enhancement" }], user: { login: "sam" } },
    { number: 3, title: "Fixed thing", state: "closed", state_reason: "completed", labels: [], user: { login: "sam" } },
    { number: 4, title: "A pull request", state: "open", labels: [], user: { login: "sam" }, pull_request: { url: "x" } },
  ]]]);

  const tickets = await fetchGithubIssuesTickets({ owner: "acme", repo: "shop", token: "", baseUrl: "", maxResults: 200 });
  tickets.forEach((ticket) => assertTicketShape(ticket, "github_issues"));
  assert.equal(tickets.length, 3, "the pull request is not a ticket");
  const { "acme/shop#1": bug, "acme/shop#2": notPlanned, "acme/shop#3": done } = byId(tickets);

  assert.equal(bug.type, "Bug");
  assert.equal(bug.priority, "Critical");
  assert.equal(bug.priority_raw, "priority: critical");
  assert.equal(bug.sprint, "v1.2");
  assert.deepEqual(bug.linked_tc_ids, ["TC-3"]);

  assert.equal(notPlanned.type, "Improvement");
  assert.equal(notPlanned.status, "Closed");
  assert.equal(notPlanned.priority_raw, null, "no priority label means no native value");
  assert.equal(done.status, "Resolved");

  assert.equal(calls[0].init.headers.Authorization, undefined, "no Authorization header without a token");
});

// -------------------------------------------------------------- Linear
const linearIssue = (identifier, over = {}) => ({
  identifier, title: `Title ${identifier}`, priority: 2, priorityLabel: "High",
  state: { name: "Todo", type: "unstarted" }, assignee: { name: "Alex Kim" }, creator: { name: "Sam Lee" },
  labels: { nodes: [] }, cycle: null, ...over,
});

test("linear: maps issues and follows the GraphQL cursor", async (t) => {
  const calls = stubFetch(t, [["graphql", (url, init) => {
    const { variables } = JSON.parse(init.body);
    if (variables.cursor === "c1") {
      return { data: { issues: { nodes: [linearIssue("ENG-2", { priority: 0, priorityLabel: "No priority", state: { name: "Cancelled", type: "canceled" } })],
        pageInfo: { hasNextPage: false, endCursor: null } } } };
    }
    return { data: { issues: { nodes: [linearIssue("ENG-1", { priority: 1, priorityLabel: "Urgent", state: { name: "In Dev", type: "started" },
      labels: { nodes: [{ name: "Bug" }, { name: "TC-4" }] }, cycle: { name: "Cycle 12" } })],
      pageInfo: { hasNextPage: true, endCursor: "c1" } } } };
  }]]);

  const tickets = await fetchLinearTickets({ apiKey: "key", teamKey: "ENG", baseUrl: "" });
  tickets.forEach((ticket) => assertTicketShape(ticket, "linear"));
  assert.equal(calls.length, 2);
  const { "ENG-1": one, "ENG-2": two } = byId(tickets);

  assert.equal(one.type, "Bug");
  assert.equal(one.priority, "Critical");
  assert.equal(one.status, "In Progress");
  assert.equal(one.status_raw, "In Dev");
  assert.equal(one.sprint, "Cycle 12");
  assert.deepEqual(one.linked_tc_ids, ["TC-4"]);

  assert.equal(two.type, "Task", "no type label falls back to Task");
  assert.equal(two.priority, "Low", "no priority falls back to Low");
  assert.equal(two.status, "Closed");
});

test("linear: a GraphQL error in a 200 response is raised, not ignored", async (t) => {
  stubFetch(t, [["graphql", { errors: [{ message: "Authentication required" }] }]]);
  await assert.rejects(fetchLinearTickets({ apiKey: "bad", teamKey: "ENG" }), /Authentication required/);
});
