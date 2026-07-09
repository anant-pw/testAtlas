// MantisBT REST API adapter (MantisBT 2.3+). Maps issues to the Normalised
// Ticket Schema. Docs: https://documenter.getpostman.com/view/29959/mantis-bt-rest-api

import { paginate } from "../lib/pagination.js";

const PRIORITY_MAP = {
  immediate: "Critical",
  urgent: "Critical",
  high: "High",
  normal: "Medium",
  low: "Low",
  none: "Low",
};

function mapPriority(priority) {
  return PRIORITY_MAP[(priority?.name || "").toLowerCase()] || "Medium";
}

function mapStatus(status) {
  const s = (status?.name || "").toLowerCase();
  if (s === "assigned" || s === "acknowledged" || s === "confirmed" || s === "feedback") return "In Progress";
  if (s === "resolved") return "Resolved";
  if (s === "closed") return "Closed";
  return "Open"; // new
}

function mapType(severity) {
  return (severity?.name || "").toLowerCase() === "feature" ? "Improvement" : "Bug";
}

function extractTcIds(tags) {
  if (!tags) return [];
  const text = tags.map((t) => t.name).join(" ");
  const matches = text.match(/\b[A-Za-z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function mapIssue(issue) {
  return {
    id: `MNT-${issue.id}`,
    summary: issue.summary || "",
    type: mapType(issue.severity),
    priority: mapPriority(issue.priority),
    status: mapStatus(issue.status),
    assignee: issue.handler?.real_name || issue.handler?.name || "Unassigned",
    created_by: issue.reporter?.real_name || issue.reporter?.name || "Unknown",
    sprint: issue.target_version || "",
    labels: (issue.tags || []).map((t) => t.name),
    linked_tc_ids: extractTcIds(issue.tags),
    source: "mantis",
    // Mantis has no native "type" field — severity drives the Bug/Improvement
    // bucket above, so it's the most meaningful raw value to show for type.
    type_raw: issue.severity?.name || null,
    priority_raw: issue.priority?.name || null,
    status_raw: issue.status?.name || null,
  };
}

export async function fetchMantisTickets(cfg) {
  const headers = { Authorization: cfg.apiToken, Accept: "application/json" };
  const pageSize = 50;

  const issues = await paginate({
    buildPageUrl: (page) => {
      const url = new URL(`${cfg.baseUrl}/api/rest/issues`);
      url.searchParams.set("project_id", cfg.projectId);
      url.searchParams.set("page_size", String(pageSize));
      url.searchParams.set("page", String(page + 1));
      return url;
    },
    headers,
    pageSize,
    extractBatch: (data) => data.issues || [],
    sourceName: "Mantis",
  });

  return issues.map(mapIssue);
}
