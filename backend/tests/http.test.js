// Tests for the shared HTTP and pagination helpers every adapter relies on.
import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchJson, buildBasicAuthHeader, buildBearerAuthHeader } from "../src/lib/http.js";
import { paginate } from "../src/lib/pagination.js";
import { stubFetch } from "./helpers.js";

function stubRawFetch(t, impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  t.after(() => {
    globalThis.fetch = original;
  });
}

test("fetchJson: a non-2xx response becomes an error naming the source and status", async (t) => {
  stubRawFetch(t, async () => ({ ok: false, status: 401, text: async () => "Bad credentials" }));
  await assert.rejects(fetchJson("https://example.org/x", { sourceName: "Jira" }), /Jira failed \(401\): Bad credentials/);
});

test("fetchJson: only the first 300 characters of an error body are passed on", async (t) => {
  stubRawFetch(t, async () => ({ ok: false, status: 500, text: async () => "x".repeat(1000) }));
  await assert.rejects(fetchJson("https://example.org/x", { sourceName: "Mantis" }), (err) => {
    assert.ok(err.message.length < 350);
    return true;
  });
});

test("fetchJson: an aborted request is reported as a timeout", async (t) => {
  stubRawFetch(t, async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  await assert.rejects(fetchJson("https://example.org/x", { sourceName: "Linear", timeoutMs: 5 }), /Linear timed out after 5ms/);
});

test("auth headers", () => {
  assert.equal(buildBasicAuthHeader("user", "pass"), `Basic ${Buffer.from("user:pass").toString("base64")}`);
  assert.equal(buildBearerAuthHeader("abc"), "Bearer abc");
});

test("paginate: keeps fetching full pages and stops at the first short one", async (t) => {
  const pages = { 0: [1, 2], 1: [3, 4], 2: [5] };
  const calls = stubFetch(t, [["page=", (url) => ({ items: pages[Number(new URL(url).searchParams.get("page"))] })]]);

  const items = await paginate({
    buildPageUrl: (page) => `https://example.org/list?page=${page}`,
    headers: {},
    pageSize: 2,
    extractBatch: (data) => data.items,
    sourceName: "Test",
  });

  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.equal(calls.length, 3);
});

test("paginate: isLastPage overrides the page-size rule", async (t) => {
  const calls = stubFetch(t, [["page=", { items: [1, 2], done: true }]]);

  const items = await paginate({
    buildPageUrl: (page) => `https://example.org/list?page=${page}`,
    headers: {},
    pageSize: 2,
    extractBatch: (data) => data.items,
    isLastPage: (data) => data.done,
    sourceName: "Test",
  });

  assert.deepEqual(items, [1, 2]);
  assert.equal(calls.length, 1, "a full page marked as last must not trigger another request");
});
