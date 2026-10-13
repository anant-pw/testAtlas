// Unit tests for src/metrics.js - the pure data logic behind every KPI and
// chart. No DOM, no network: plain normalised tickets/test cases in, plain
// data out.
import { describe, it, expect } from "vitest";
import {
  applyFilters,
  automationCoverage,
  bugsByStatus,
  computeSprintWindows,
  coverageByTicketType,
  getAllSprints,
  getCurrentAndPreviousSprint,
  getTCSprint,
  openVsClosedTrend,
  passRate,
  reconcileLinks,
  suiteHealth,
  tallyByStatus,
  worstCaseStatus,
} from "../src/metrics.js";

const tc = (id, over = {}) => ({
  id, title: id, suite: "Auth", type: "Manual", status: "Passed", execution_date: null,
  assigned_tester: "A", build_version: "", linked_jira_ids: [], ...over,
});
const ticket = (id, over = {}) => ({
  id, summary: id, type: "Bug", priority: "High", status: "Open", sprint: "", labels: [], linked_tc_ids: [], ...over,
});
const NO_FILTERS = { sprint: "All Sprints", suites: [], priorities: [], types: [] };

describe("passRate", () => {
  it("is passed / executed, where executed excludes Not Run", () => {
    const list = [tc("1"), tc("2"), tc("3", { status: "Failed" }), tc("4", { status: "Blocked" }), tc("5", { status: "Not Run" })];
    expect(passRate(list)).toBe(50);
  });

  it("is null, not 0 or 100, when nothing has been executed", () => {
    expect(passRate([tc("1", { status: "Not Run" })])).toBeNull();
    expect(passRate([])).toBeNull();
  });
});

describe("tallyByStatus", () => {
  it("counts every known status and ignores unknown ones", () => {
    const list = [tc("1"), tc("2"), tc("3", { status: "Failed" }), tc("4", { status: "Weird" })];
    expect(tallyByStatus(list)).toEqual({ Passed: 2, Failed: 1, Blocked: 0, "Not Run": 0 });
  });
});

describe("automationCoverage", () => {
  it("is the share of test cases marked Automated", () => {
    expect(automationCoverage([tc("1", { type: "Automated" }), tc("2"), tc("3"), tc("4")])).toBe(25);
  });

  it("is 0 for an empty list", () => {
    expect(automationCoverage([])).toBe(0);
  });
});

describe("worstCaseStatus", () => {
  it("ranks Failed above Blocked above Not Run above Passed", () => {
    expect(worstCaseStatus(["Passed", "Not Run"])).toBe("Not Run");
    expect(worstCaseStatus(["Not Run", "Blocked", "Passed"])).toBe("Blocked");
    expect(worstCaseStatus(["Blocked", "Failed", "Passed"])).toBe("Failed");
  });

  it("is null when there are no statuses", () => {
    expect(worstCaseStatus([])).toBeNull();
  });
});

describe("reconcileLinks", () => {
  it("merges both sides' view of a link into both objects", () => {
    const tickets = [ticket("P-1", { linked_tc_ids: ["TC-1"] }), ticket("P-2")];
    const testCases = [tc("TC-1"), tc("TC-2", { linked_jira_ids: ["P-2"] })];
    const result = reconcileLinks(tickets, testCases);

    expect(result.testCases.find((t) => t.id === "TC-1").linked_jira_ids).toEqual(["P-1"]);
    expect(result.tickets.find((t) => t.id === "P-2").linked_tc_ids).toEqual(["TC-2"]);
  });

  it("drops links to test cases or tickets that do not exist", () => {
    // "RELEASE-2" is what a Jira label like "release-2" looks like after the
    // adapter's pattern match - it must not make the ticket look covered.
    const tickets = [ticket("P-1", { linked_tc_ids: ["TC-1", "RELEASE-2"] })];
    const testCases = [tc("TC-1", { linked_jira_ids: ["P-404"] })];
    const result = reconcileLinks(tickets, testCases);

    expect(result.tickets[0].linked_tc_ids).toEqual(["TC-1"]);
    expect(result.testCases[0].linked_jira_ids).toEqual(["P-1"]);
  });

  it("does not mutate its inputs", () => {
    const tickets = [ticket("P-1", { linked_tc_ids: ["TC-1"] })];
    const testCases = [tc("TC-1")];
    reconcileLinks(tickets, testCases);
    expect(testCases[0].linked_jira_ids).toEqual([]);
  });
});

describe("sprints", () => {
  it("current and previous are the last two sprint labels in sorted order", () => {
    const sprints = getAllSprints([ticket("1", { sprint: "Sprint 2" }), ticket("2", { sprint: "Sprint 1" }), ticket("3")]);
    expect(sprints).toEqual(["Sprint 1", "Sprint 2"]);
    expect(getCurrentAndPreviousSprint(sprints)).toEqual({ current: "Sprint 2", previous: "Sprint 1" });
  });

  it("both are null when the source has no sprint data", () => {
    expect(getCurrentAndPreviousSprint([])).toEqual({ current: null, previous: null });
  });
});

describe("computeSprintWindows (an approximation: test cases carry no sprint)", () => {
  const dated = [tc("1", { execution_date: "2026-05-01T09:00:00Z" }), tc("2", { execution_date: "2026-05-11T09:00:00Z" })];

  it("splits the executed date range into equal windows, one per sprint", () => {
    expect(computeSprintWindows(dated, ["S1", "S2"])).toEqual({
      S1: ["2026-05-01", "2026-05-05"],
      S2: ["2026-05-06", "2026-05-11"],
    });
  });

  it("uses a single 'Current' window when there are no sprints", () => {
    expect(computeSprintWindows(dated, [])).toEqual({ Current: ["2026-05-01", "2026-05-11"] });
  });

  it("returns no windows when nothing has been executed", () => {
    expect(computeSprintWindows([tc("1")], ["S1"])).toEqual({});
  });

  it("getTCSprint places a test case by execution date, and unexecuted ones in the current sprint", () => {
    const windows = computeSprintWindows(dated, ["S1", "S2"]);
    expect(getTCSprint(tc("x", { execution_date: "2026-05-03T00:00:00Z" }), windows, "S2")).toBe("S1");
    expect(getTCSprint(tc("y", { execution_date: "2026-05-07T00:00:00Z" }), windows, "S2")).toBe("S2");
    expect(getTCSprint(tc("z"), windows, "S2")).toBe("S2");
  });
});

describe("applyFilters", () => {
  const tickets = [
    ticket("P-1", { priority: "Critical", linked_tc_ids: ["TC-1"] }),
    ticket("P-2", { priority: "Low", linked_tc_ids: ["TC-2"] }),
    ticket("P-3", { priority: "Low" }),
  ];
  const testCases = [
    tc("TC-1", { suite: "Auth", linked_jira_ids: ["P-1"] }),
    tc("TC-2", { suite: "Payments", linked_jira_ids: ["P-2"] }),
    tc("TC-3", { suite: "Payments" }),
  ];

  it("returns everything when no filter is set", () => {
    const result = applyFilters(tickets, testCases, NO_FILTERS, {}, null);
    expect(result.tickets).toHaveLength(3);
    expect(result.testCases).toHaveLength(3);
  });

  it("a suite filter keeps only tickets linked to a test case in that suite", () => {
    const result = applyFilters(tickets, testCases, { ...NO_FILTERS, suites: ["Payments"] }, {}, null);
    expect(result.tickets.map((t) => t.id)).toEqual(["P-2"]);
    expect(result.testCases.map((t) => t.id)).toEqual(["TC-2", "TC-3"]);
  });

  it("a priority filter keeps only test cases linked to a ticket of that priority", () => {
    const result = applyFilters(tickets, testCases, { ...NO_FILTERS, priorities: ["Critical"] }, {}, null);
    expect(result.tickets.map((t) => t.id)).toEqual(["P-1"]);
    expect(result.testCases.map((t) => t.id)).toEqual(["TC-1"]);
  });
});

describe("suiteHealth", () => {
  it("reports counts, pass rate and the latest run per suite", () => {
    const list = [
      tc("1", { suite: "Auth", execution_date: "2026-05-01T00:00:00Z" }),
      tc("2", { suite: "Auth", status: "Failed", execution_date: "2026-05-03T00:00:00Z" }),
      tc("3", { suite: "Pay", status: "Not Run" }),
    ];
    expect(suiteHealth(list)).toEqual([
      { suite: "Auth", total: 2, passed: 1, failed: 1, blocked: 0, notRun: 0, passPct: 50, lastRun: "2026-05-03T00:00:00Z" },
      { suite: "Pay", total: 1, passed: 0, failed: 0, blocked: 0, notRun: 1, passPct: null, lastRun: null },
    ]);
  });
});

describe("defect charts", () => {
  const tickets = [
    ticket("1", { sprint: "S1", status: "Open" }),
    ticket("2", { sprint: "S1", status: "In Progress" }),
    ticket("3", { sprint: "S2", status: "Resolved" }),
    ticket("4", { sprint: "S2", status: "Closed" }),
    ticket("5", { sprint: "S2", status: "Open", type: "Story" }), // not a bug: excluded
  ];

  it("bugsByStatus counts bugs only", () => {
    expect(bugsByStatus(tickets)).toEqual([
      { name: "Open", value: 1 },
      { name: "In Progress", value: 1 },
      { name: "Resolved", value: 1 },
      { name: "Closed", value: 1 },
    ]);
  });

  it("openVsClosedTrend treats In Progress as open and Resolved as closed", () => {
    expect(openVsClosedTrend(tickets, ["S1", "S2"])).toEqual([
      { sprint: "S1", Open: 2, Closed: 0 },
      { sprint: "S2", Open: 0, Closed: 2 },
    ]);
  });

  it("falls back to one 'All' bucket when the source has no sprints", () => {
    expect(openVsClosedTrend(tickets, [])).toEqual([{ sprint: "All", Open: 2, Closed: 2 }]);
  });
});

describe("coverageByTicketType", () => {
  it("is the automation share of the test cases linked to tickets of each type", () => {
    const tickets = [ticket("B-1", { type: "Bug", linked_tc_ids: ["TC-1", "TC-2"] }), ticket("S-1", { type: "Story", linked_tc_ids: ["TC-2"] })];
    const testCases = [tc("TC-1", { type: "Automated" }), tc("TC-2")];
    const byType = Object.fromEntries(coverageByTicketType(tickets, testCases).map((r) => [r.type, r.coverage]));
    expect(byType.Bug).toBe(50);
    expect(byType.Story).toBe(0);
    expect(byType.Epic).toBe(0);
  });
});
