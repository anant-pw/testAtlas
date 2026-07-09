// Shared HTTP helpers for adapters — every adapter previously called fetch()
// directly and reimplemented its own auth header, error handling, and (for
// 6 of them) pagination loop from scratch. Centralised here so a fix/change
// (e.g. the request timeout below) only has to happen once.

// No adapter previously set a request timeout, so a stalled upstream API
// (Jira, Bugzilla, etc.) could hang the Express handler — and the
// frontend's fetch waiting on it — indefinitely. 20s is generous enough for
// any of this project's real upstream calls while still failing instead of
// hanging forever.
const DEFAULT_TIMEOUT_MS = 20000;

export async function fetchJson(url, { method, body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, sourceName } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, body, headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${sourceName || "Request"} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`${sourceName || "Request"} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function buildBasicAuthHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export function buildBearerAuthHeader(token) {
  return `Bearer ${token}`;
}
