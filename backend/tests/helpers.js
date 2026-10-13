// Shared helpers for the adapter contract tests.
//
// The fixtures in these tests are hand-written to the response shapes each
// adapter reads, taken from the tools' public API docs. They are NOT
// recordings of real accounts. What these tests prove: given a response of
// that shape, the adapter produces a valid normalised object with the right
// field mapping. What they do not prove: that the real API still returns
// that shape. Jira, TestLink and Kiwi TCMS were also run against real
// instances (see README).
import assert from "node:assert/strict";

export const TICKET_TYPES = ["Bug", "Story", "Task", "Improvement", "Epic"];
export const PRIORITIES = ["Critical", "High", "Medium", "Low"];
export const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
export const TC_TYPES = ["Manual", "Automated"];
export const TC_STATUSES = ["Passed", "Failed", "Blocked", "Not Run"];

const TICKET_KEYS = [
  "id", "summary", "type", "priority", "status", "assignee", "created_by", "sprint",
  "labels", "linked_tc_ids", "source", "type_raw", "priority_raw", "status_raw",
];
const TEST_CASE_KEYS = [
  "id", "title", "suite", "type", "status", "execution_date", "assigned_tester", "build_version",
  "linked_jira_ids", "automation_script_path", "source", "status_raw",
];

const isString = (v) => typeof v === "string";
const isStringOrNull = (v) => v === null || typeof v === "string";
const isStringArray = (v) => Array.isArray(v) && v.every(isString);

// The Normalised Ticket Schema, as documented at the top of
// TestManagementDashboard.jsx. Every ticket adapter must satisfy this.
export function assertTicketShape(ticket, source) {
  assert.deepEqual(Object.keys(ticket).sort(), [...TICKET_KEYS].sort(), `${ticket.id}: unexpected or missing keys`);
  for (const key of ["id", "summary", "assignee", "created_by", "sprint"]) {
    assert.ok(isString(ticket[key]), `${ticket.id}: ${key} must be a string`);
  }
  assert.ok(ticket.id.length > 0, "id must not be empty");
  assert.ok(TICKET_TYPES.includes(ticket.type), `${ticket.id}: type "${ticket.type}" is not canonical`);
  assert.ok(PRIORITIES.includes(ticket.priority), `${ticket.id}: priority "${ticket.priority}" is not canonical`);
  assert.ok(TICKET_STATUSES.includes(ticket.status), `${ticket.id}: status "${ticket.status}" is not canonical`);
  assert.ok(isStringArray(ticket.labels), `${ticket.id}: labels must be string[]`);
  assert.ok(isStringArray(ticket.linked_tc_ids), `${ticket.id}: linked_tc_ids must be string[]`);
  assert.equal(ticket.source, source);
  for (const key of ["type_raw", "priority_raw", "status_raw"]) {
    assert.ok(isStringOrNull(ticket[key]), `${ticket.id}: ${key} must be string or null`);
  }
}

// The Normalised TestCase Schema. Every test-case adapter must satisfy this.
export function assertTestCaseShape(tc, source) {
  assert.deepEqual(Object.keys(tc).sort(), [...TEST_CASE_KEYS].sort(), `${tc.id}: unexpected or missing keys`);
  for (const key of ["id", "title", "suite", "assigned_tester", "build_version"]) {
    assert.ok(isString(tc[key]), `${tc.id}: ${key} must be a string`);
  }
  assert.ok(tc.id.length > 0, "id must not be empty");
  assert.ok(TC_TYPES.includes(tc.type), `${tc.id}: type "${tc.type}" is not canonical`);
  assert.ok(TC_STATUSES.includes(tc.status), `${tc.id}: status "${tc.status}" is not canonical`);
  assert.ok(isStringOrNull(tc.execution_date), `${tc.id}: execution_date must be string or null`);
  assert.ok(isStringArray(tc.linked_jira_ids), `${tc.id}: linked_jira_ids must be string[]`);
  assert.ok(isStringOrNull(tc.automation_script_path), `${tc.id}: automation_script_path must be string or null`);
  assert.equal(tc.source, source);
  assert.ok(isStringOrNull(tc.status_raw), `${tc.id}: status_raw must be string or null`);
}

// Replaces global fetch for one test. `routes` is an ordered list of
// [matcher, body]; the first matcher that accepts (url, init) wins. A
// matcher is a substring of the URL or a function. Unmatched calls fail the
// test, so an adapter cannot silently call an endpoint the test did not
// expect. Returns the list of calls made, for asserting on URLs/headers.
export function stubFetch(t, routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    const route = routes.find(([matcher]) => (typeof matcher === "string" ? href.includes(matcher) : matcher(href, init)));
    if (!route) throw new Error(`Unexpected fetch in test: ${init.method || "GET"} ${href}`);
    const body = typeof route[1] === "function" ? route[1](href, init) : route[1];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

export const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
