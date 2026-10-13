// Pure data logic for the dashboard: canonical enums, ticket <-> test case
// link reconciliation, filters, and every metric/chart derivation. No React,
// no fetch - everything here takes plain arrays of normalised tickets/test
// cases and returns plain data, so it is unit-tested directly
// (see tests/metrics.test.js).

export const TICKET_TYPES = ["Bug", "Story", "Task", "Improvement", "Epic"];
export const PRIORITIES = ["Critical", "High", "Medium", "Low"];
export const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
export const TC_STATUSES = ["Passed", "Failed", "Blocked", "Not Run"];

// Tickets and test cases each come from their own independent live source,
// and those two systems have no native way to agree on cross-links (e.g. a
// Jira label pointing at a TestLink TC id has no effect on what TestLink's
// own API reports back). The mock dataset is generated already-consistent
// in both directions; real sources generally aren't, so we reconcile here —
// unioning each side's view of the link into both objects — rather than
// trusting either source's linked_tc_ids/linked_jira_ids in isolation.
export function reconcileLinks(tickets, testCases) {
  const tcIds = new Set(testCases.map((t) => t.id));
  const ticketIds = new Set(tickets.map((t) => t.id));

  const jiraIdsByTc = {};
  for (const ticket of tickets) {
    for (const tcId of ticket.linked_tc_ids) {
      if (!tcIds.has(tcId)) continue;
      (jiraIdsByTc[tcId] ||= new Set()).add(ticket.id);
    }
  }
  for (const tc of testCases) {
    for (const jiraId of tc.linked_jira_ids) {
      if (!ticketIds.has(jiraId)) continue;
      (jiraIdsByTc[tc.id] ||= new Set()).add(jiraId);
    }
  }

  // Invert jiraIdsByTc once (O(total links)) instead of, as before,
  // re-scanning every entry of it for every single ticket (O(tickets x
  // links)) — same result, just without the redundant rescans.
  const tcIdsByJira = {};
  for (const [tcId, jiraIds] of Object.entries(jiraIdsByTc)) {
    for (const jiraId of jiraIds) {
      (tcIdsByJira[jiraId] ||= new Set()).add(tcId);
    }
  }

  const reconciledTickets = tickets.map((ticket) => {
    // Keep only links to test cases that actually exist. Adapters find TC ids
    // by pattern (e.g. any "ABC-12"-shaped Jira label), so a label such as
    // "release-2" would otherwise count the ticket as covered by a test.
    const linked = new Set(ticket.linked_tc_ids.filter((id) => tcIds.has(id)));
    for (const tcId of tcIdsByJira[ticket.id] || []) linked.add(tcId);
    return { ...ticket, linked_tc_ids: [...linked] };
  });

  const reconciledTestCases = testCases.map((tc) => ({
    ...tc,
    linked_jira_ids: [...(jiraIdsByTc[tc.id] || [])],
  }));

  return { tickets: reconciledTickets, testCases: reconciledTestCases };
}

// =============================================================================
// Computed metrics helpers — pure functions, reused across every page.
// =============================================================================

// Suites are whatever labels the connected TC source actually uses — derive
// them from the data instead of assuming a fixed list.
export function getDistinctSuites(testCases) {
  return [...new Set(testCases.map((t) => t.suite).filter(Boolean))].sort();
}

// Priority/type stay fixed canonical buckets (every adapter normalises into
// them — see NORMALISED TICKET SCHEMA), but not every bucket necessarily has
// a ticket in it for the currently connected source. Filter the canonical
// list down to what's actually present so the dropdown doesn't offer dead
// options, same spirit as suites/sprints above.
export function getAvailablePriorities(tickets) {
  const present = new Set(tickets.map((t) => t.priority));
  return PRIORITIES.filter((p) => present.has(p));
}
export function getAvailableTicketTypes(tickets) {
  const present = new Set(tickets.map((t) => t.type));
  return TICKET_TYPES.filter((t) => present.has(t));
}

// Sprints are whatever labels the connected ticket source actually uses
// (often none at all, if the team doesn't run sprints). "Current"/"previous"
// are simply the last two in sorted order — for mock data ("Sprint 1/2/3")
// that's the same as before; for real data with no sprint field at all,
// both come back null and every sprint-comparison feature degrades
// gracefully (see Delta/KpiCard — they render "—" when value is null).
export function getAllSprints(tickets) {
  return [...new Set(tickets.map((t) => t.sprint).filter(Boolean))].sort();
}

export function getCurrentAndPreviousSprint(sprints) {
  return {
    current: sprints.length ? sprints[sprints.length - 1] : null,
    previous: sprints.length > 1 ? sprints[sprints.length - 2] : null,
  };
}

// Test cases don't carry a sprint field (TestLink has no such concept) —
// bucket them by execution date instead. Rather than a hardcoded calendar
// table, split the actual [earliest, latest execution] span seen in the
// data into as many equal windows as there are known sprints, so this
// adapts to whenever "now" actually is and how the org's sprints are
// spaced, instead of assuming our mock dataset's specific 2026 dates.
export function computeSprintWindows(testCases, sprints) {
  const days = testCases.map((t) => t.execution_date && t.execution_date.slice(0, 10)).filter(Boolean).sort();
  if (days.length === 0) return {};
  const labels = sprints.length ? sprints : ["Current"];
  const start = new Date(days[0]).getTime();
  const end = new Date(days[days.length - 1]).getTime();
  const span = Math.max(end - start, 86400000); // floor of 1 day, so a single-day data span still yields a valid window
  const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);

  const windows = {};
  labels.forEach((label, i) => {
    const windowStart = start + (span * i) / labels.length;
    const windowEnd = i === labels.length - 1 ? end : start + (span * (i + 1)) / labels.length - 86400000;
    windows[label] = [toDay(windowStart), toDay(Math.max(windowEnd, windowStart))];
  });
  return windows;
}

export function getTCSprint(tc, sprintWindows, currentSprint) {
  const labels = Object.keys(sprintWindows);
  const fallback = currentSprint ?? labels[labels.length - 1] ?? null;
  if (!tc.execution_date) return fallback; // not-yet-run TCs are pending in the active window
  const day = tc.execution_date.slice(0, 10);
  for (const label of labels) {
    const [s, e] = sprintWindows[label];
    if (day >= s && day <= e) return label;
  }
  return fallback;
}

export const WORST_CASE_ORDER = ["Passed", "Not Run", "Blocked", "Failed"];
export function worstCaseStatus(statuses) {
  if (!statuses.length) return null;
  return statuses.reduce(
    (worst, s) => (WORST_CASE_ORDER.indexOf(s) > WORST_CASE_ORDER.indexOf(worst) ? s : worst),
    "Passed"
  );
}

// Single-pass status tally — replaces what used to be 4-5 independent
// `.filter(t => t.status === "X").length` scans over the same list at every
// call site (suiteHealth, tcStatusBreakdown, overviewKpis, per-page KPIs,
// testerStats). Defaults to TC statuses; pass TICKET_STATUSES for tickets.
export function tallyByStatus(list, statuses = TC_STATUSES) {
  const counts = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (const item of list) {
    if (item.status in counts) counts[item.status] += 1;
  }
  return counts;
}

export function passRate(list) {
  const { Passed: passed, Failed: failed, Blocked: blocked } = tallyByStatus(list);
  const denom = passed + failed + blocked;
  return denom === 0 ? null : (passed / denom) * 100;
}

export function automationCoverage(list) {
  if (!list.length) return 0;
  return (list.filter((t) => t.type === "Automated").length / list.length) * 100;
}

export function suiteHealth(testCases) {
  return getDistinctSuites(testCases).map((suite) => {
    const list = testCases.filter((t) => t.suite === suite);
    const { Passed: passed, Failed: failed, Blocked: blocked, "Not Run": notRun } = tallyByStatus(list);
    const lastRun = list.reduce((latest, t) => (t.execution_date && (!latest || t.execution_date > latest) ? t.execution_date : latest), null);
    return { suite, total: list.length, passed, failed, blocked, notRun, passPct: passRate(list), lastRun };
  });
}

// applyFilters operates on the FULL (unfiltered) tickets/testCases so that
// cross-referencing a ticket's linked TC suite (or vice-versa) always has
// the complete picture available, then returns the filtered subsets.
// sprintWindows/currentSprint come from useData() — they're derived once
// from the full dataset (see DataProvider) so a TC's sprint bucket doesn't
// shift depending on which filters happen to be active.
export function applyFilters(tickets, testCases, filters, sprintWindows, currentSprint) {
  const { sprint, suites, priorities, types } = filters;
  const tcById = Object.fromEntries(testCases.map((t) => [t.id, t]));
  const ticketById = Object.fromEntries(tickets.map((t) => [t.id, t]));

  const filteredTickets = tickets.filter((t) => {
    if (sprint !== "All Sprints" && t.sprint !== sprint) return false;
    if (priorities.length && !priorities.includes(t.priority)) return false;
    if (types.length && !types.includes(t.type)) return false;
    if (suites.length) {
      const ticketSuites = t.linked_tc_ids.map((id) => tcById[id]?.suite).filter(Boolean);
      if (!ticketSuites.some((s) => suites.includes(s))) return false;
    }
    return true;
  });

  const filteredTestCases = testCases.filter((tc) => {
    if (suites.length && !suites.includes(tc.suite)) return false;
    if (sprint !== "All Sprints" && getTCSprint(tc, sprintWindows, currentSprint) !== sprint) return false;
    if (priorities.length || types.length) {
      const linkedTickets = tc.linked_jira_ids.map((id) => ticketById[id]).filter(Boolean);
      const priorityOk = !priorities.length || linkedTickets.some((lt) => priorities.includes(lt.priority));
      const typeOk = !types.length || linkedTickets.some((lt) => types.includes(lt.type));
      if (!priorityOk || !typeOk) return false;
    }
    return true;
  });

  return { tickets: filteredTickets, testCases: filteredTestCases };
}

export function filterForSprint(tickets, testCases, filters, sprintOverride, sprintWindows, currentSprint) {
  if (sprintOverride == null) return { tickets: [], testCases: [] }; // no such sprint (e.g. no "previous" exists yet)
  return applyFilters(tickets, testCases, { ...filters, sprint: sprintOverride }, sprintWindows, currentSprint);
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function enumerateDates(start, end) {
  const days = [];
  let cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return days;
}

// =============================================================================
// Chart-data derivation helpers — each takes already-filtered arrays and
// shapes them for a specific Recharts component.
// =============================================================================
export function tcStatusBreakdown(testCases) {
  const counts = tallyByStatus(testCases);
  return TC_STATUSES.map((status) => ({ name: status, value: counts[status] }));
}

export function passRateTrendBySprint(testCases, sprintWindows, currentSprint) {
  return Object.keys(sprintWindows).map((sprint) => {
    const list = testCases.filter((tc) => getTCSprint(tc, sprintWindows, currentSprint) === sprint);
    const manual = list.filter((t) => t.type === "Manual");
    const auto = list.filter((t) => t.type === "Automated");
    return { sprint, Manual: Math.round(passRate(manual) ?? 0), Automated: Math.round(passRate(auto) ?? 0) };
  });
}

// Tickets carry their own sprint label directly. When the connected source
// has no sprint data at all (sprints is empty), fall back to a single "All"
// bucket over the whole ticket set instead of filtering against a sprint
// name that will never match anything real.
export function ticketsBySprintBucket(tickets, sprints) {
  if (sprints.length === 0) return [["All", tickets]];
  return sprints.map((sprint) => [sprint, tickets.filter((t) => t.sprint === sprint)]);
}

export function defectsByPriorityCurrentSprint(tickets, currentSprint) {
  const bugs = tickets.filter((t) => t.type === "Bug" && (currentSprint == null || t.sprint === currentSprint));
  return PRIORITIES.map((priority) => ({ priority, count: bugs.filter((t) => t.priority === priority).length }));
}

export function passPctPerSuite(testCases) {
  return suiteHealth(testCases).map((s) => ({ suite: s.suite, passPct: Math.round(s.passPct ?? 0) }));
}

export function suiteSprintBreakdown(testCases, sprintWindows, currentSprint) {
  const rows = [];
  getDistinctSuites(testCases).forEach((suite) => {
    Object.keys(sprintWindows).forEach((sprint) => {
      const list = testCases.filter((tc) => tc.suite === suite && getTCSprint(tc, sprintWindows, currentSprint) === sprint);
      rows.push({
        key: `${suite.slice(0, 4)} ${sprint.replace("Sprint ", "S")}`,
        Passed: list.filter((t) => t.status === "Passed").length,
        Failed: list.filter((t) => t.status === "Failed").length,
        Blocked: list.filter((t) => t.status === "Blocked").length,
        "Not Run": list.filter((t) => t.status === "Not Run").length,
      });
    });
  });
  return rows;
}

export function dailyExecutionTrend(testCases, sprintWindows, currentSprint) {
  const range = currentSprint != null ? sprintWindows[currentSprint] : Object.values(sprintWindows).at(-1);
  if (!range) return [];
  const days = enumerateDates(range[0], range[1]);
  return days.map((day) => {
    const list = testCases.filter((tc) => tc.execution_date && tc.execution_date.slice(0, 10) === day);
    return {
      day: new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Executed: list.length,
      Passed: list.filter((t) => t.status === "Passed").length,
    };
  });
}

export function manualVsAutoPerSprint(testCases, sprintWindows, currentSprint) {
  return Object.keys(sprintWindows).map((sprint) => {
    const list = testCases.filter((tc) => getTCSprint(tc, sprintWindows, currentSprint) === sprint);
    return {
      sprint,
      Manual: list.filter((t) => t.type === "Manual").length,
      Automated: list.filter((t) => t.type === "Automated").length,
    };
  });
}

export function suiteAutomationCoverage(testCases) {
  return getDistinctSuites(testCases).map((suite) => {
    const list = testCases.filter((t) => t.suite === suite);
    return { suite, coverage: Math.round(automationCoverage(list)) };
  });
}

export function coverageByTicketType(tickets, testCases) {
  const tcById = Object.fromEntries(testCases.map((t) => [t.id, t]));
  return TICKET_TYPES.map((type) => {
    const ticketsOfType = tickets.filter((t) => t.type === type);
    const tcIds = new Set();
    ticketsOfType.forEach((t) => t.linked_tc_ids.forEach((id) => tcIds.add(id)));
    const list = [...tcIds].map((id) => tcById[id]).filter(Boolean);
    return { type, coverage: Math.round(automationCoverage(list)) };
  });
}

export function coverageTrendBySprint(testCases, sprintWindows, currentSprint) {
  return Object.keys(sprintWindows).map((sprint) => {
    const list = testCases.filter((tc) => getTCSprint(tc, sprintWindows, currentSprint) === sprint);
    return { sprint, coverage: Math.round(automationCoverage(list)) };
  });
}

export function defectsByPriorityPerSprint(tickets, sprints) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  return ticketsBySprintBucket(bugs, sprints).map(([sprint, list]) => ({
    sprint,
    Critical: list.filter((t) => t.priority === "Critical").length,
    High: list.filter((t) => t.priority === "High").length,
    Medium: list.filter((t) => t.priority === "Medium").length,
    Low: list.filter((t) => t.priority === "Low").length,
  }));
}

export function bugsByStatus(tickets) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  const counts = tallyByStatus(bugs, TICKET_STATUSES);
  return TICKET_STATUSES.map((status) => ({ name: status, value: counts[status] }));
}

export function openVsClosedTrend(tickets, sprints) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  return ticketsBySprintBucket(bugs, sprints).map(([sprint, list]) => ({
    sprint,
    Open: list.filter((t) => t.status === "Open" || t.status === "In Progress").length,
    Closed: list.filter((t) => t.status === "Closed" || t.status === "Resolved").length,
  }));
}
