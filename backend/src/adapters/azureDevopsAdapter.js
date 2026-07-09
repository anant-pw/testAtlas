// Azure DevOps Boards (Work Item Tracking) REST API adapter.
// Maps work items to the dashboard's Normalised Ticket Schema.
// Docs: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/

import { fetchJson, buildBasicAuthHeader } from "../lib/http.js";

const WORK_ITEM_TYPE_MAP = {
  bug: "Bug",
  "user story": "Story",
  story: "Story",
  task: "Task",
  issue: "Task",
  improvement: "Improvement",
  feature: "Improvement",
  epic: "Epic",
};

function mapWorkItemType(name) {
  return WORK_ITEM_TYPE_MAP[(name || "").toLowerCase()] || "Task";
}

// Azure DevOps priority is numeric, 1 (highest) - 4 (lowest), regardless of process template.
function mapPriority(n) {
  const num = Number(n);
  if (num === 1) return "Critical";
  if (num === 2) return "High";
  if (num === 3) return "Medium";
  return "Low";
}

function mapStatus(state) {
  const s = (state || "").toLowerCase();
  if (s.includes("progress") || s.includes("doing") || s.includes("active") || s.includes("committed")) return "In Progress";
  if (s.includes("closed") || s.includes("done") || s.includes("completed")) return "Closed";
  if (s.includes("resolved")) return "Resolved";
  return "Open"; // New, To Do, Proposed, Backlog, ...
}

// IterationPath looks like "MyProject\\Sprint 1\\Week 1" — the deepest
// segment that isn't the project name itself is treated as the sprint.
function extractSprint(iterationPath, project) {
  if (!iterationPath) return "";
  const segments = iterationPath.split("\\").filter(Boolean);
  const rest = segments[0] === project ? segments.slice(1) : segments;
  return rest.length ? rest[rest.length - 1] : "";
}

function extractTcIds(tagsField) {
  if (!tagsField) return [];
  const matches = tagsField.match(/\b[A-Za-z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

function mapWorkItem(item, cfg) {
  const f = item.fields || {};
  return {
    id: `${cfg.project}-${item.id}`,
    summary: f["System.Title"] || "",
    type: mapWorkItemType(f["System.WorkItemType"]),
    priority: mapPriority(f["Microsoft.VSTS.Common.Priority"]),
    status: mapStatus(f["System.State"]),
    assignee: f["System.AssignedTo"]?.displayName || "Unassigned",
    created_by: f["System.CreatedBy"]?.displayName || "Unknown",
    sprint: extractSprint(f["System.IterationPath"], cfg.project),
    labels: (f["System.Tags"] || "").split(";").map((t) => t.trim()).filter(Boolean),
    linked_tc_ids: extractTcIds(f["System.Tags"]),
    source: "azure_devops",
    type_raw: f["System.WorkItemType"] || null,
    priority_raw: f["Microsoft.VSTS.Common.Priority"] != null ? String(f["Microsoft.VSTS.Common.Priority"]) : null,
    status_raw: f["System.State"] || null,
  };
}

export async function fetchAzureDevopsTickets(cfg) {
  // Overridable so Azure DevOps Server (on-prem, different URL shape) and
  // tests pointing at a mock can both work; defaults to the real Cloud API.
  const root = cfg.baseUrl || "https://dev.azure.com";
  const base = `${root}/${cfg.org}/${encodeURIComponent(cfg.project)}/_apis/wit`;
  const headers = { Authorization: buildBasicAuthHeader("", cfg.pat), "Content-Type": "application/json", Accept: "application/json" };
  const wiql = cfg.wiql || "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC";

  const wiqlData = await fetchJson(`${base}/wiql?api-version=7.1`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: wiql }),
    sourceName: "Azure DevOps",
  });
  const ids = (wiqlData.workItems || []).map((w) => w.id);
  if (ids.length === 0) return [];

  // The work item batch endpoint caps at 200 ids per request.
  const items = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const data = await fetchJson(`${base}/workitems?ids=${batch.join(",")}&api-version=7.1`, { headers, sourceName: "Azure DevOps" });
    items.push(...(data.value || []));
  }

  return items.map((item) => mapWorkItem(item, cfg));
}
