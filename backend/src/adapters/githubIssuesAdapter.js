// GitHub REST API adapter for Issues. Maps issues to the Normalised Ticket
// Schema. Docs: https://docs.github.com/en/rest/issues/issues
//
// GitHub has no native priority/type/sprint fields — everything here is
// inferred from labels and milestones, which is genuinely how most teams
// triage on GitHub. Adjust LABEL_PRIORITY_MAP / LABEL_TYPE_MAP to match
// whatever label conventions your repo actually uses.

import { fetchJson } from "../lib/http.js";

const LABEL_PRIORITY_MAP = {
  "priority: critical": "Critical",
  "priority: high": "High",
  "priority: medium": "Medium",
  "priority: low": "Low",
  critical: "Critical",
  urgent: "Critical",
};

const LABEL_TYPE_MAP = {
  bug: "Bug",
  enhancement: "Improvement",
  feature: "Story",
  documentation: "Task",
  epic: "Epic",
};

function mapPriority(labelNames) {
  for (const name of labelNames) {
    const mapped = LABEL_PRIORITY_MAP[name.toLowerCase()];
    if (mapped) return mapped;
  }
  return "Medium";
}

function mapType(labelNames) {
  for (const name of labelNames) {
    const mapped = LABEL_TYPE_MAP[name.toLowerCase()];
    if (mapped) return mapped;
  }
  return "Bug"; // GitHub Issues skew toward bug tracking by default
}

function mapStatus(issue) {
  if (issue.state === "open") return "Open"; // GitHub has no separate "in progress" state without a project board
  return issue.state_reason === "not_planned" ? "Closed" : "Resolved";
}

// The actual label that drove a mapPriority/mapType bucket above, for
// display — null when nothing matched (i.e. the bucket above is just our
// generic default, not something GitHub itself signalled).
function findMatchingLabel(labelNames, map) {
  for (const name of labelNames) {
    if (map[name.toLowerCase()]) return name;
  }
  return null;
}

function extractTcIds(labelNames) {
  const matches = labelNames.join(" ").match(/\b[A-Za-z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function mapIssue(issue, cfg) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name));
  return {
    id: `${cfg.owner}/${cfg.repo}#${issue.number}`,
    summary: issue.title || "",
    type: mapType(labelNames),
    priority: mapPriority(labelNames),
    status: mapStatus(issue),
    assignee: issue.assignee?.login || issue.assignees?.[0]?.login || "Unassigned",
    created_by: issue.user?.login || "Unknown",
    sprint: issue.milestone?.title || "",
    labels: labelNames,
    linked_tc_ids: extractTcIds(labelNames),
    source: "github_issues",
    // GitHub has no native type/priority fields at all — only the matching
    // label, if any, counts as a "native value" here.
    type_raw: findMatchingLabel(labelNames, LABEL_TYPE_MAP),
    priority_raw: findMatchingLabel(labelNames, LABEL_PRIORITY_MAP),
    status_raw: issue.state_reason ? `${issue.state} (${issue.state_reason})` : issue.state || null,
  };
}

export async function fetchGithubIssuesTickets(cfg) {
  // Public repos work unauthenticated (60 req/hr instead of 5000/hr) — only
  // send Authorization if a token is actually configured. An empty Bearer
  // token is rejected as malformed, which is worse than omitting it.
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  const perPage = 100;
  let page = 1;
  const issues = [];
  // Caps how many issues get pulled, newest-updated-first — a busy repo can
  // have tens of thousands of historical issues, same risk as an unscoped
  // Bugzilla query.
  const maxResults = cfg.maxResults || 200;

  while (issues.length < maxResults) {
    // Overridable so GitHub Enterprise Server (different API root) and
    // tests pointing at a mock can both work; defaults to github.com.
    const root = cfg.baseUrl || "https://api.github.com";
    const url = `${root}/repos/${cfg.owner}/${cfg.repo}/issues?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
    const batch = await fetchJson(url, { headers, sourceName: "GitHub Issues" });
    // The issues endpoint also returns pull requests — exclude them, since
    // a PR isn't a "ticket" in our schema's sense.
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < perPage) break;
    page += 1;
  }

  return issues.map((issue) => mapIssue(issue, cfg));
}
