// Bugzilla REST API adapter. Maps bugs to the Normalised Ticket Schema.
// Docs: https://bugzilla.readthedocs.io/en/latest/api/core/v1/bug.html

import { fetchJson } from "../lib/http.js";

const PRIORITY_MAP = {
  p1: "Critical",
  highest: "Critical",
  p2: "High",
  high: "High",
  p3: "Medium",
  normal: "Medium",
  p4: "Low",
  low: "Low",
  p5: "Low",
  lowest: "Low",
};

function mapPriority(priority, severity) {
  const mapped = PRIORITY_MAP[(priority || "").toLowerCase()];
  if (mapped) return mapped;
  // Some installs only use severity (blocker/critical/major/normal/minor/trivial) for triage.
  const s = (severity || "").toLowerCase();
  if (s === "blocker" || s === "critical") return "Critical";
  if (s === "major") return "High";
  if (s === "minor" || s === "trivial") return "Low";
  return "Medium";
}

function mapStatus(status, resolution) {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS" || s === "ASSIGNED" || s === "REOPENED") return "In Progress";
  if (s === "RESOLVED" || s === "VERIFIED") return resolution === "FIXED" ? "Resolved" : "Closed";
  if (s === "CLOSED") return "Closed";
  return "Open"; // UNCONFIRMED, CONFIRMED, NEW
}

function mapType(severity) {
  return (severity || "").toLowerCase() === "enhancement" ? "Improvement" : "Bug";
}

function extractTcIds(keywords) {
  if (!keywords) return [];
  const matches = keywords.join(" ").match(/\b[A-Za-z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function mapBug(bug) {
  return {
    id: `BZ-${bug.id}`,
    summary: bug.summary || "",
    type: mapType(bug.severity),
    priority: mapPriority(bug.priority, bug.severity),
    status: mapStatus(bug.status, bug.resolution),
    assignee: bug.assigned_to_detail?.real_name || bug.assigned_to || "Unassigned",
    created_by: bug.creator_detail?.real_name || bug.creator || "Unknown",
    sprint: bug.target_milestone && bug.target_milestone !== "---" ? bug.target_milestone : "",
    labels: bug.keywords || [],
    linked_tc_ids: extractTcIds(bug.keywords),
    source: "bugzilla",
    // Bugzilla has no native "type" field — severity drives the Bug/Improvement
    // bucket above, so it's the most meaningful raw value to show for type.
    type_raw: bug.severity || null,
    priority_raw: bug.priority || null,
    status_raw: bug.resolution ? `${bug.status} (${bug.resolution})` : bug.status || null,
  };
}

export async function fetchBugzillaTickets(cfg) {
  const fields = ["id", "summary", "status", "resolution", "priority", "severity", "assigned_to", "creator", "keywords", "target_milestone"];
  const bugs = [];
  const limit = 100;
  let offset = 0;
  // Unlike Jira (which requires a scoped JQL) Bugzilla has no equivalent
  // built-in guard — an unscoped query against a large public tracker like
  // bugzilla.mozilla.org can mean tens of thousands of bugs across decades,
  // which would otherwise paginate forever. Cap total results and sort
  // newest-changed-first so what you get is the most relevant slice.
  const maxResults = cfg.maxResults || 200;

  while (bugs.length < maxResults) {
    const url = new URL(`${cfg.baseUrl}/rest/bug`);
    if (cfg.product) url.searchParams.set("product", cfg.product);
    url.searchParams.set("include_fields", fields.join(","));
    url.searchParams.set("limit", String(Math.min(limit, maxResults - bugs.length)));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order", "changeddate DESC");

    // Public Bugzilla instances (e.g. bugzilla.mozilla.org) allow anonymous
    // read access to public bugs — only send the key header if one is
    // actually configured. Sending an empty key is rejected as invalid,
    // which is worse than not sending it at all.
    const headers = { Accept: "application/json" };
    if (cfg.apiKey) headers["X-BUGZILLA-API-KEY"] = cfg.apiKey;
    const data = await fetchJson(url, { headers, sourceName: "Bugzilla" });
    const page = data.bugs || [];
    bugs.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return bugs.map(mapBug);
}
