import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "../TestManagementDashboard.jsx";

// Fixture tickets returned by the stubbed `tickets` endpoint. Picked to
// exercise both halves of the hybrid native-value feature in one pass:
// type_raw === canonical (PROJ-1, "Bug") shows no tooltip, type_raw !==
// canonical (PROJ-4, "Enhancement") shows "Native: Enhancement" — and one
// ticket per canonical type/priority bucket so the header filter dropdowns
// have something real to enumerate.
const FIXTURE_TICKETS = [
  { id: "PROJ-1", summary: "Login fails on Chrome", type: "Bug", priority: "Critical", status: "Open", assignee: "Alex Kim", created_by: "Alex Kim", sprint: "", labels: [], linked_tc_ids: [], source: "fixture", type_raw: "Bug", priority_raw: "Critical", status_raw: "Open" },
  { id: "PROJ-2", summary: "Add SSO support", type: "Story", priority: "High", status: "In Progress", assignee: "Sam Lee", created_by: "Sam Lee", sprint: "", labels: [], linked_tc_ids: [], source: "fixture", type_raw: "Story", priority_raw: "High", status_raw: "In Progress" },
  { id: "PROJ-3", summary: "Update onboarding copy", type: "Task", priority: "Medium", status: "Resolved", assignee: "Jo Diaz", created_by: "Jo Diaz", sprint: "", labels: [], linked_tc_ids: [], source: "fixture", type_raw: "Task", priority_raw: "Medium", status_raw: "Resolved" },
  { id: "PROJ-4", summary: "Streamline report export", type: "Improvement", priority: "Low", status: "Closed", assignee: "Pat Wu", created_by: "Pat Wu", sprint: "", labels: [], linked_tc_ids: [], source: "fixture", type_raw: "Enhancement", priority_raw: "Low", status_raw: "Closed" },
  { id: "PROJ-5", summary: "Migrate billing service", type: "Epic", priority: "High", status: "Open", assignee: "Unassigned", created_by: "Pat Wu", sprint: "", labels: [], linked_tc_ids: [], source: "fixture", type_raw: "Epic", priority_raw: "High", status_raw: "Open" },
];

// Stubs the network boundary instead of flipping CONFIG.USE_MOCK (which
// would mean mutating real source for the test to pass). DataService still
// runs its real fetch-based code path; only the actual network call is
// faked, matched by resource suffix so it doesn't care which DEFECT_SOURCE/
// TC_SOURCE happens to be configured.
function stubFetch() {
  global.fetch = vi.fn((url) => {
    const href = String(url);
    if (href.includes("/tickets")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FIXTURE_TICKETS) });
    }
    if (href.includes("/testcases")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.reject(new Error(`Unexpected fetch in test: ${href}`));
  });
}

function clickByText(container, text) {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  if (!el) throw new Error(`Button not found: ${text}`);
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("TestAtlas dashboard smoke test", () => {
  let container;
  let root;

  beforeEach(async () => {
    stubFetch();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    // let DataProvider's fetch + reconcileLinks settle before asserting
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  it("never touches the real network in mock mode — fetch is not called", () => {
    // USE_MOCK: true (the default) serves data from the in-memory dataset;
    // the fetch stub exists but must remain untouched.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a native-value tooltip only when the source's raw value differs from the canonical bucket", async () => {
    await act(async () => {
      clickByText(container, "Traceability");
    });

    const bugPill = [...container.querySelectorAll("span")].find((e) => e.textContent.trim() === "Bug");
    const improvementPill = [...container.querySelectorAll("span")].find((e) => e.textContent.trim() === "Improvement");

    expect(bugPill).toBeTruthy();
    expect(bugPill.getAttribute("title")).toBeNull();

    expect(improvementPill).toBeTruthy();
    expect(improvementPill.getAttribute("title")).toBe("Native: Enhancement");
  });

  it("Priority filter only offers the canonical priorities actually present in the data", async () => {
    const priorityButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Priority"));
    await act(async () => {
      priorityButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const options = [...container.querySelectorAll("label")]
      .filter((l) => /^(Critical|High|Medium|Low)$/.test(l.textContent.trim()))
      .map((l) => l.textContent.trim());

    expect(options).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  it("Ticket Type filter offers all 5 canonical types present in the data", async () => {
    const typeButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Ticket Type"));
    await act(async () => {
      typeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const options = [...container.querySelectorAll("label")]
      .filter((l) => /^(Bug|Story|Task|Improvement|Epic)$/.test(l.textContent.trim()))
      .map((l) => l.textContent.trim());

    expect(options).toEqual(["Bug", "Story", "Task", "Improvement", "Epic"]);
  });

  it("shows a last-updated timestamp in the header after data loads", () => {
    const timeEl = container.querySelector("time");
    expect(timeEl).toBeTruthy();
    expect(timeEl.getAttribute("aria-live")).toBe("polite");
    expect(timeEl.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(timeEl.textContent.trim()).toMatch(/^Updated .*\d{1,2}:\d{2}/i);
  });
});
