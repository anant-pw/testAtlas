// Jira REST API v3 adapter.
// Fetches issues via JQL search and maps each one to the dashboard's
// Normalised Ticket Schema (see TestManagementDashboard.jsx for the contract).

import { fetchJson, buildBasicAuthHeader, buildBearerAuthHeader } from "../lib/http.js";

const ISSUE_TYPE_MAP = {
  bug: "Bug",
  story: "Story",
  task: "Task",
  "sub-task": "Task",
  subtask: "Task",
  improvement: "Improvement",
  epic: "Epic",
};

const PRIORITY_MAP = {
  highest: "Critical",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Low",
};

function mapIssueType(name) {
  return ISSUE_TYPE_MAP[(name || "").toLowerCase()] || "Task";
}

function mapPriority(name) {
  return PRIORITY_MAP[(name || "").toLowerCase()] || "Medium";
}

function mapStatus(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("progress") || n.includes("review")) return "In Progress";
  if (n.includes("closed") || n.includes("done")) return "Closed";
  if (n.includes("resolved")) return "Resolved";
  return "Open"; // To Do, Open, Backlog, New, ...
}

// Jira's Sprint custom field has shipped in two incompatible shapes over the
// years: an array of plain objects ({id, name, state, ...}) on current Cloud
// instances, and an array of stringified Java objects
// ("com.atlassian...Sprint@1b2c3d[id=5,...,name=Sprint 3,...]") on older
// Server/early Cloud instances. Handle both; fall back to "" (unsprinted).
function extractSprint(value) {
  if (!value) return "";
  const arr = Array.isArray(value) ? value : [value];
  if (arr.length === 0) return "";
  const last = arr[arr.length - 1]; // most recently added sprint wins
  if (typeof last === "object" && last !== null) return last.name || "";
  if (typeof last === "string") {
    const match = last.match(/name=([^,\]]+)/);
    return match ? match[1] : last;
  }
  return "";
}

// There's no universal Jira field for "linked TestLink TC ids". TC ids take
// whatever prefix the source TestLink project uses (TC-1, WSF-4, MBK-12,
// ...), not always literally "TC-", so we match any short alpha prefix +
// dash + number rather than a hardcoded "TC-" pattern, scanning both the
// optional configured custom field AND plain Jira labels (zero-config path
// most teams can use without setting up a custom field at all).
const TC_ID_PATTERN = /\b[A-Za-z]{2,8}-\d+\b/g;

function extractTcIds(value) {
  if (!value) return [];
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const matches = text.match(TC_ID_PATTERN) || [];
  return matches.map((m) => m.toUpperCase());
}

function extractTcIdsFromLabels(labels) {
  if (!labels) return [];
  // "sprint-N" is our reserved sprint-label convention (see
  // extractSprintFromLabels below) — exclude it so a ticket's sprint label
  // doesn't also get misread as a link to a fake "SPRINT-N" test case.
  return labels.filter((l) => /^[A-Za-z]{2,8}-\d+$/.test(l) && !/^sprint-\d+$/i.test(l)).map((l) => l.toUpperCase());
}

// Kanban-only boards (team-managed Jira projects without the Sprints
// feature) have no Sprint field at all — JIRA_SPRINT_FIELD will be blank
// and extractSprint() always returns "". As a zero-config fallback for
// exactly that case, a "sprint-N" label is treated as the sprint, normalised
// to match the "Sprint N" naming the rest of the dashboard already uses.
function extractSprintFromLabels(labels) {
  if (!labels) return "";
  const match = labels.find((l) => /^sprint-\d+$/i.test(l));
  if (!match) return "";
  const n = match.match(/\d+/)[0];
  return `Sprint ${n}`;
}

function buildAuthHeader(cfg) {
  if (cfg.personalAccessToken) {
    return buildBearerAuthHeader(cfg.personalAccessToken);
  }
  return buildBasicAuthHeader(cfg.email, cfg.apiToken);
}

function mapIssue(issue, cfg) {
  const f = issue.fields || {};
  return {
    id: issue.key,
    summary: f.summary || "",
    type: mapIssueType(f.issuetype?.name),
    priority: mapPriority(f.priority?.name),
    status: mapStatus(f.status?.name),
    assignee: f.assignee?.displayName || "Unassigned",
    created_by: f.reporter?.displayName || "Unknown",
    sprint: extractSprint(cfg.sprintField ? f[cfg.sprintField] : null) || extractSprintFromLabels(f.labels),
    labels: f.labels || [],
    linked_tc_ids: [...new Set([...extractTcIds(cfg.tcLinkField ? f[cfg.tcLinkField] : null), ...extractTcIdsFromLabels(f.labels)])],
    source: "jira",
    // Jira's own type/priority/workflow-status names are fully custom per
    // instance — pass them through as-is for display, alongside the bucket
    // they got normalised into above.
    type_raw: f.issuetype?.name || null,
    priority_raw: f.priority?.name || null,
    status_raw: f.status?.name || null,
  };
}

export async function fetchJiraTickets(cfg) {
  const fields = ["summary", "issuetype", "priority", "status", "assignee", "reporter", "labels"];
  if (cfg.sprintField) fields.push(cfg.sprintField);
  if (cfg.tcLinkField) fields.push(cfg.tcLinkField);

  const headers = {
    Authorization: buildAuthHeader(cfg),
    Accept: "application/json",
  };

  const issues = [];
  let startAt = 0;
  let nextPageToken = null;
  const maxResults = 100;

  // Jira Cloud retired the classic /rest/api/3/search endpoint (count-based
  // startAt/total paging) in favor of /rest/api/3/search/jql (token-based
  // paging via nextPageToken/isLast — it never returns a total). Server/Data
  // Center installs are unaffected and still use the classic endpoint. Which
  // shape to expect is determined by the configured path, not guessed
  // per-response, since the new endpoint's last page has no nextPageToken
  // and would otherwise be indistinguishable from "use startAt instead".
  const tokenPaginated = cfg.searchPath.includes("/search/jql");

  while (true) {
    const url = new URL(cfg.baseUrl + cfg.searchPath);
    url.searchParams.set("jql", cfg.jql);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("fields", fields.join(","));
    if (tokenPaginated) {
      if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
    } else {
      url.searchParams.set("startAt", String(startAt));
    }

    const data = await fetchJson(url, { headers, sourceName: "Jira" });
    issues.push(...(data.issues || []));

    if (!data.issues || data.issues.length === 0) break;
    if (tokenPaginated) {
      if (data.isLast || !data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    } else {
      startAt += data.issues.length;
      const total = data.total ?? issues.length;
      if (startAt >= total) break;
    }
  }

  return issues.map((issue) => mapIssue(issue, cfg));
}
