// Linear GraphQL API adapter. Maps issues to the Normalised Ticket Schema.
// Docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api

import { fetchJson } from "../lib/http.js";

const QUERY = `
  query Issues($teamKey: String!, $cursor: String) {
    issues(filter: { team: { key: { eq: $teamKey } } }, first: 100, after: $cursor) {
      nodes {
        identifier
        title
        priority
        priorityLabel
        state { name type }
        assignee { name }
        creator { name }
        labels { nodes { name } }
        cycle { name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Linear priority is numeric: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.
function mapPriority(priority) {
  if (priority === 1) return "Critical";
  if (priority === 2) return "High";
  if (priority === 3) return "Medium";
  return "Low"; // 4 (Low) and 0 (No priority) both fall back to Low
}

// state.type is Linear's stable, non-customizable categorisation — more
// reliable than state.name, which teams can rename freely.
function mapStatus(stateType) {
  if (stateType === "started") return "In Progress";
  if (stateType === "completed") return "Resolved";
  if (stateType === "canceled") return "Closed";
  return "Open"; // triage, backlog, unstarted
}

function extractTcIds(labelNames) {
  const matches = labelNames.join(" ").match(/\b[A-Za-z]{2,8}-\d+\b/g) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
}

// Linear has no native issue-type field — like GitHub Issues, infer it from
// labels. Without this, every Linear issue would default to "Task" and the
// Defects page (which filters on type === "Bug") would always be empty.
const LABEL_TYPE_MAP = {
  bug: "Bug",
  story: "Story",
  feature: "Story",
  improvement: "Improvement",
  epic: "Epic",
};

function mapType(labelNames) {
  for (const name of labelNames) {
    const mapped = LABEL_TYPE_MAP[name.toLowerCase()];
    if (mapped) return mapped;
  }
  return "Task";
}

function findMatchingLabel(labelNames, map) {
  for (const name of labelNames) {
    if (map[name.toLowerCase()]) return name;
  }
  return null;
}

function mapIssue(issue) {
  const labelNames = (issue.labels?.nodes || []).map((l) => l.name);
  return {
    id: issue.identifier,
    summary: issue.title || "",
    type: mapType(labelNames),
    priority: mapPriority(issue.priority),
    status: mapStatus(issue.state?.type),
    assignee: issue.assignee?.name || "Unassigned",
    created_by: issue.creator?.name || "Unknown",
    sprint: issue.cycle?.name || "",
    labels: labelNames,
    linked_tc_ids: extractTcIds(labelNames),
    source: "linear",
    // Linear has no native type field — only the matching label, if any,
    // counts as a "native value". state.name (not state.type) is Linear's
    // actual, team-renameable workflow state display name.
    type_raw: findMatchingLabel(labelNames, LABEL_TYPE_MAP),
    priority_raw: issue.priorityLabel || null,
    status_raw: issue.state?.name || null,
  };
}

export async function fetchLinearTickets(cfg) {
  const headers = { Authorization: cfg.apiKey, "Content-Type": "application/json" };
  const issues = [];
  let cursor = null;

  while (true) {
    // Overridable for tests pointing at a mock; defaults to Linear's one
    // real endpoint (it's SaaS-only, no self-hosted variant).
    const body = await fetchJson(cfg.baseUrl || "https://api.linear.app/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: QUERY, variables: { teamKey: cfg.teamKey, cursor } }),
      sourceName: "Linear",
    });
    // GraphQL can return 200 OK with a top-level "errors" array instead of an
    // HTTP error status — fetchJson's res.ok check doesn't catch this case.
    if (body.errors) throw new Error(`Linear GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);

    const { nodes, pageInfo } = body.data.issues;
    issues.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return issues.map(mapIssue);
}
