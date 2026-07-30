# TestAtlas – Test & Defect Management Dashboard

A dashboard that actually answers: **“Are we shipping quality?”**

TestAtlas unifies your **test case management** and **defect/bug tracking** into one live QA view — with pass rates, automation coverage, traceability, tester analytics, defect trends, and sprint reporting.

It works with **Jira + TestLink** out of the box, but it is not limited to them. The dashboard reads from a **normalised schema**, so connecting a different test management or defect tracker usually means writing one adapter file, not changing the dashboard itself.

![status](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## What TestAtlas helps you track

- **QA progress dashboard** with KPI cards and trend charts.
- **Test execution health** across suites, sprints, and daily runs.
- **Automation coverage** by suite and ticket type.
- **Traceability** between tickets and test cases.
- **Tester performance** with assigned test cases, pass rate, failures, blocks, and linked defects.
- **Defect trends** by priority, status, and open vs closed volume.
- **Sprint reporting** with top failures, critical bugs, and regressions.

If you need a **test management dashboard**, **bug tracker dashboard**, or a unified **QA progress view**, TestAtlas is built for that use case.

## Features

- **Overview** — KPI cards, pass/fail/automation trend charts, and attention-required callouts.
- **Test Execution** — suite health table, per-suite and per-sprint execution breakdown, daily execution trends.
- **Automation** — coverage by suite and ticket type, coverage trends, manual-test automation backlog.
- **Traceability** — ticket ↔ test case matrix with coverage gaps highlighted.
- **Testers** — per-tester pass percentage, assigned test cases, failures, blocks, linked defects, and critical/high issues.
- **Defects** — bug trends by priority and status, open-vs-closed trend, linked test case status.
- **Reports** — sprint summary, top failures, critical bugs, most improved/regressed suites, CSV/PDF export hooks.

Works immediately with generated mock data (`CONFIG.USE_MOCK = true`), or against your real Jira + TestLink instances once the backend is configured.

## Why TestAtlas is different

Most tools focus only on either:
- test case management, or
- issue/bug tracking.

TestAtlas is designed to show both in one place, so QA teams can quickly answer:
- What is tested?
- What is failing?
- Which bugs are blocking release?
- How much automation coverage do we have?
- Which suites or testers need attention?

## Architecture

```text
TestManagementDashboard.jsx   Single-file React app with dashboard, charts, mock data, and data service
src/main.jsx, index.html      Vite entry point for running the dashboard
backend/                      Express API that adapts each source into one normalised schema
  src/adapters/*.js           One file per source → normalised Ticket / TestCase schema
  src/routes/*.js             One route per source, mounted under /api/<source>/...
  server.js                   Express app, CORS, optional shared-secret auth
```

The dashboard never talks to any defect tracker or test case manager directly. It only calls the backend, and the backend keeps credentials server-side.

## Supported sources

Source selection is controlled by config in `TestManagementDashboard.jsx`:

- `DEFECT_SOURCE`
- `TC_SOURCE`
- `CI_SOURCE`

Each adapter maps its tool’s API response onto the same **normalised Ticket / TestCase / CI Run schema**. Add a new source by writing one adapter that fills that contract; the rest of the app does not need to change.

| Category | Implemented & verified against a real account | Implemented & verified end-to-end against mocks | Not built yet |
|---|---|---|---|
| Defect / project tracker | Jira | Azure DevOps, Bugzilla, Mantis, GitHub Issues, Linear | — |
| Test case management | TestLink | TestRail, qTest, Zephyr Scale, PractiTest, Kiwi TCMS, Azure DevOps Test Plans | — |
| CI / automation reports | — | — | Jenkins, GitHub Actions, GitLab CI, Allure, ReportPortal |

**What “verified end-to-end against mocks” means:** each adapter was built against the tool’s public API docs and tested through the full pipeline — mock server, backend, HTTP routing, and dashboard rendering. Jira and TestLink also went through live-account verification.

CI sources currently have no backend route or adapter yet, and no dashboard page reads `CI_SOURCE`.

Contributions adding or hardening an adapter are welcome. See any file in `backend/src/adapters/` for the pattern to follow.

## Quick start

### Mock data, no backend needed

Install the frontend dependencies from the repository root, then start the Vite app:

```bash
npm install
npm run dev
```

Open the printed local URL. `CONFIG.USE_MOCK` defaults to `true` in `TestManagementDashboard.jsx`, so this works with zero configuration.

### Real backend setup

If you want to connect Jira, TestLink, or another supported source:

```bash
npm install
cd backend
npm install
cp .env.example .env
```

Then start the backend from the `backend/` folder:

```bash
npm start
```

Start the frontend from the repository root:

```bash
npm run dev
```

## Configure real sources

Fill only the env vars relevant to the sources you enable.

### Defect / project tracker

| `DEFECT_SOURCE` | Required env vars |
|---|---|
| `jira` | `JIRA_BASE_URL`, `JIRA_JQL`, plus (`JIRA_EMAIL` + `JIRA_API_TOKEN`) or `JIRA_PERSONAL_ACCESS_TOKEN` |
| `azure_devops` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` |
| `bugzilla` | `BUGZILLA_BASE_URL`, `BUGZILLA_API_KEY` |
| `mantis` | `MANTIS_BASE_URL`, `MANTIS_API_TOKEN`, `MANTIS_PROJECT_ID` |
| `github_issues` | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN` |
| `linear` | `LINEAR_API_KEY`, `LINEAR_TEAM_KEY` |

### Test case management

| `TC_SOURCE` | Required env vars |
|---|---|
| `testlink` | `TESTLINK_BASE_URL`, `TESTLINK_DEV_KEY` |
| `testrail` | `TESTRAIL_BASE_URL`, `TESTRAIL_EMAIL`, `TESTRAIL_API_KEY`, `TESTRAIL_PROJECT_ID` |
| `qtest` | `QTEST_BASE_URL`, `QTEST_BEARER_TOKEN`, `QTEST_PROJECT_ID` |
| `zephyr_scale` | `ZEPHYR_API_TOKEN`, `ZEPHYR_PROJECT_KEY` |
| `practitest` | `PRACTITEST_EMAIL`, `PRACTITEST_API_TOKEN`, `PRACTITEST_PROJECT_ID` |
| `kiwi_tcms` | `KIWI_BASE_URL`, `KIWI_USERNAME`, `KIWI_API_TOKEN` |
| `azure_devops_testplans` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` |

### Optional security

Set `BACKEND_API_KEY` if you want a shared-secret check between frontend and backend.

## Azure DevOps note

Azure DevOps Boards and Azure Test Plans share the same credentials. If you want to use both:

```js
DEFECT_SOURCE: "azure_devops",
TC_SOURCE: "azure_devops_testplans",
```

No extra env vars are needed beyond the `AZURE_DEVOPS_*` values.

## Linking tickets to test cases

There is no universal Jira field for “linked TestLink test case.” The backend looks for test case IDs like `TC-001` or `WSF-4` in:

- Jira labels,
- and an optional custom field (`JIRA_TC_LINK_FIELD`).

Add the test case ID as a label on the Jira ticket to link them.

## Prerequisites

- Node.js 18+
- A Jira Cloud or Jira Server/Data Center instance, if you want real defect data
- A TestLink instance, if you want real test case data

Both tools are optional — the dashboard runs entirely on mock data out of the box.

## Security notes

- Credentials such as `JIRA_API_TOKEN` and `TESTLINK_DEV_KEY` live only in `backend/.env`, which is gitignored.
- Never put real credentials in `TestManagementDashboard.jsx`; it runs in the browser.
- `BACKEND_API_KEY` is only a lightweight internal shared secret. It is **not** a substitute for real authentication if you expose this publicly.
- There is no built-in HTTPS termination or request rate limiting. Put this behind your own reverse proxy or auth layer before exposing it outside a trusted network.

## Known limitations

- Non-Jira/TestLink adapters are verified against mocked APIs, not live accounts for every service.
- Azure DevOps, GitHub Issues, and Linear adapters default to public SaaS endpoints but can accept a base URL override for server/enterprise versions.
- Jira issue types beyond common ones such as Bug, Story, Task, Improvement, and Epic may collapse into Task.
- Some test case systems may show tester names as IDs if the source API does not provide enough user metadata.
- Suite and automation flags may be inferred from labels, tags, or custom fields depending on the source.
- Field mapping for priority, status, and issue type may need tuning for custom workflows.
- No CI pipeline yet. A frontend smoke suite covers data loading, filter behavior, and the header — run with `npm test`.

## Tech stack

- **Frontend:** React, Recharts, Lucide icons, Tailwind via CDN, Vite
- **Backend:** Express, `xmlrpc`, `dotenv`

## License

MIT — see [LICENSE](LICENSE).
