# TestAtlas

An enterprise-style test management dashboard that unifies a defect tracker and a test case manager into one view — pass rates, automation coverage, traceability, defect trends, and sprint reporting. It ships wired up to **Jira** + **TestLink**, but it isn't built specifically for them: the dashboard only ever talks to a normalised schema, not to Jira/TestLink directly, so pointing it at a different tool is a matter of writing one new backend adapter, not modifying the dashboard.

![status](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Overview** — KPI cards, pass/fail/automation trend charts, attention-required callouts (suites below 60% pass rate, uncovered ticket types, failing automated tests)
- **Test Execution** — suite health table, per-suite/sprint execution breakdown, daily execution trend
- **Automation** — coverage by suite/ticket type, coverage trend, manual-test automation backlog
- **Traceability** — ticket ↔ test case matrix with coverage gaps surfaced
- **Defects** — bug trends by priority/status, open-vs-closed trend, linked test case status
- **Reports** — sprint summary, top failures/critical bugs, most improved/regressed suites, CSV/PDF export hooks

Works immediately with generated mock data (`CONFIG.USE_MOCK = true`), or against your real Jira + TestLink instances once the backend is configured.

## Architecture

```
TestManagementDashboard.jsx   single-file React app (dashboard, charts, mock data, DataService)
src/main.jsx, index.html      Vite entry point for running the dashboard
backend/                      Express API that adapts each source into one normalised schema
  src/adapters/*.js                One file per source → Normalised Ticket/TestCase Schema
  src/routes/*.js                   One route per source, mounted under /api/<source>/...
  server.js                        Express app, CORS, optional shared-secret auth
```

The dashboard never talks to any defect tracker or test case manager directly — it only calls the backend, and the backend holds all credentials server-side. Only the adapter matching your configured `DEFECT_SOURCE`/`TC_SOURCE` is ever actually called; the others sit idle and report "not configured" if hit directly.

## Supported & planned sources

Source selection is a single config switch (`DEFECT_SOURCE` / `TC_SOURCE` / `CI_SOURCE` in `TestManagementDashboard.jsx`), and every adapter's only job is mapping its tool's API response onto the same **Normalised Ticket / TestCase / CI Run Schema** documented at the top of that file — that contract is what every page, chart, and filter actually reads from. Add a new source by writing one adapter that fills that contract; nothing else in the app needs to change.

| Category | Implemented & verified against a real account | Implemented & verified end-to-end against mocks | Not built yet |
|---|---|---|---|
| Defect/Project tracker | Jira | Azure DevOps, Bugzilla, Mantis, GitHub Issues, Linear | — |
| Test case management | TestLink | TestRail, qTest, Zephyr Scale, PractiTest, Kiwi TCMS | — |
| CI/automation reports | — | — | Jenkins, GitHub Actions, GitLab CI, Allure, ReportPortal |

**What "verified end-to-end against mocks" actually means** for the 10 non-Jira/TestLink adapters: each one was built against that tool's public API docs, then proven through the *whole* real pipeline — a mock server speaking that tool's documented response shape, a real backend instance routing to the real adapter over real HTTP, and (for at least one defect source + one TC source) the actual dashboard UI rendering the result end to end. That's a meaningfully deeper check than "the function returns the right JSON" — it exercises routing, config loading, and rendering exactly like production would. What it can't catch: a live account behaving differently than its own documentation says. Jira and TestLink went through that step too — it's how a retired Jira endpoint and a couple of real TestLink server bugs got caught — and nothing's substituted for it on the other 10 yet. If you hit a mismatch against your real instance, it's almost always a one-line field-name fix in that adapter, not a sign the approach is broken.

CI sources have no backend route or adapter yet, and no dashboard page reads `CI_SOURCE` — that slot in the architecture is reserved but unbuilt.

Contributions adding or hardening an adapter are welcome — see any file in `backend/src/adapters/` for the pattern to follow.

## Prerequisites

- Node.js 18+
- A Jira Cloud (or Server/Data Center) instance, if you want real defect data
- A TestLink instance, if you want real test case data
- Both are optional — the dashboard runs entirely on mock data out of the box

## Quick start (mock data, no backend needed)

```bash
npm install
npm run dev
```

Open the printed local URL. `CONFIG.USE_MOCK` defaults to `true` in `TestManagementDashboard.jsx`, so this works with zero configuration.

## Running against a real defect tracker / test case manager

1. **Configure the backend**

   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```

   `.env.example` has a section per source — fill in only the ones matching what you set `DEFECT_SOURCE`/`TC_SOURCE` to:

   | `DEFECT_SOURCE` | Required env vars |
   |---|---|
   | `jira` | `JIRA_BASE_URL`, `JIRA_JQL`, + (`JIRA_EMAIL`+`JIRA_API_TOKEN` or `JIRA_PERSONAL_ACCESS_TOKEN`) |
   | `azure_devops` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` |
   | `bugzilla` | `BUGZILLA_BASE_URL`, `BUGZILLA_API_KEY` |
   | `mantis` | `MANTIS_BASE_URL`, `MANTIS_API_TOKEN`, `MANTIS_PROJECT_ID` |
   | `github_issues` | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN` |
   | `linear` | `LINEAR_API_KEY`, `LINEAR_TEAM_KEY` |

   | `TC_SOURCE` | Required env vars |
   |---|---|
   | `testlink` | `TESTLINK_BASE_URL`, `TESTLINK_DEV_KEY` |
   | `testrail` | `TESTRAIL_BASE_URL`, `TESTRAIL_EMAIL`, `TESTRAIL_API_KEY`, `TESTRAIL_PROJECT_ID` |
   | `qtest` | `QTEST_BASE_URL`, `QTEST_BEARER_TOKEN`, `QTEST_PROJECT_ID` |
   | `zephyr_scale` | `ZEPHYR_API_TOKEN`, `ZEPHYR_PROJECT_KEY` |
   | `practitest` | `PRACTITEST_EMAIL`, `PRACTITEST_API_TOKEN`, `PRACTITEST_PROJECT_ID` |
   | `kiwi_tcms` | `KIWI_BASE_URL`, `KIWI_USERNAME`, `KIWI_API_TOKEN` |

   Optionally also set `BACKEND_API_KEY` (see [Security notes](#security-notes)).

2. **Start the backend**

   ```bash
   npm start
   # or, for crash-resilient supervision:
   npm run pm2:start
   ```

   It listens on `http://localhost:8001` by default (`PORT` in `.env`), with one route mounted per source (e.g. `/api/jira/tickets`, `/api/testrail/testcases`) regardless of which one is actually active.

3. **Point the dashboard at it**

   In `TestManagementDashboard.jsx`, set:
   ```js
   USE_MOCK: false,
   DEFECT_SOURCE: "jira",   // or "azure_devops" | "bugzilla" | "mantis" | "github_issues" | "linear"
   TC_SOURCE: "testlink",   // or "testrail" | "qtest" | "zephyr_scale" | "practitest" | "kiwi_tcms"
   API_KEY: "",             // must match BACKEND_API_KEY if you set one
   ```

4. **Run the dashboard**

   ```bash
   npm run dev
   ```

### Sprint data on Kanban-only Jira projects

Jira's native Sprint field requires a Scrum board. If your project is Kanban-only (no Sprints feature), the backend falls back to reading sprint membership from a `sprint-1` / `sprint-2` / `sprint-3` label on each ticket — add those labels to get sprint-based charts and deltas working without a Scrum board.

### Linking tickets to test cases

There's no universal Jira field for "linked TestLink test case." The backend looks for TC ids (e.g. `TC-001`, `WSF-4`) in Jira labels and in an optional configured custom field (`JIRA_TC_LINK_FIELD`). Add the test case id as a label on the Jira ticket to link them.

## Security notes

- Credentials (`JIRA_API_TOKEN`, `TESTLINK_DEV_KEY`, etc.) live **only** in `backend/.env`, which is gitignored. Never put real credentials in `TestManagementDashboard.jsx` — it runs in the browser.
- `BACKEND_API_KEY` is an optional shared-secret header check between the dashboard and backend. It ships to the browser (visible via dev tools), so it's a defense-in-depth measure for an internal/VPN-perimeter deployment — **not** a substitute for real authentication if you expose this publicly.
- There is no rate limiting, request auth beyond the optional shared secret, or HTTPS termination built in. Put this behind your own reverse proxy / auth layer before exposing it outside a trusted network.

## Known limitations

- The 10 non-Jira/TestLink adapters are verified end-to-end against mocked APIs, not against a real account on each service (see the [Supported & planned sources](#supported--planned-sources) table) — expect the occasional field-name mismatch against your actual instance.
- Azure DevOps, GitHub Issues, and Linear adapters default to the public SaaS endpoints but accept a base-URL override (`AZURE_DEVOPS_BASE_URL`, `GITHUB_API_BASE_URL`, `LINEAR_API_BASE_URL`) for Azure DevOps Server / GitHub Enterprise Server — untested against either, since I don't have an instance of either to verify against.
- Jira issue types beyond `Bug/Story/Task/Improvement/Epic` (e.g. `Feature`, `Request`) collapse into `Task` — extend `ISSUE_TYPE_MAP` in `backend/src/adapters/jiraAdapter.js` if you need them distinct.
- Several TC sources (TestLink, TestRail, qTest, PractiTest) can't resolve a numeric tester/user id to a display name without extra org-specific setup, so testers may show as `Tester #<id>` / `User <id>` rather than a real name.
- "Suite" and "automation flag" aren't standardized concepts in most of these tools — several adapters infer them from labels/tags/custom fields rather than a dedicated field. Check each adapter's header comment for exactly what it assumes.
- Field mapping (priority, status, issue type) is keyword/heuristic-based and may need tuning for workflows that don't use common naming.
- No CI pipeline yet. A frontend smoke suite (Vitest) covers data loading, filter behaviour, and the header — run with `npm test`.

## Tech stack

React, Recharts, Lucide icons, Tailwind (via CDN in `index.html`), Vite — frontend. Express, `xmlrpc`, `dotenv` — backend.

## License

MIT — see [LICENSE](LICENSE).
