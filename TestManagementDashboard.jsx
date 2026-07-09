// =============================================================================
// Test Management Dashboard — single-file enterprise React artifact.
//
// "Single-file" describes the DELIVERABLE only: every component, the mock
// dataset, the DataService abstraction, contexts, and all six pages live in
// this one .jsx file. It is architected to swap from mock data to live,
// multi-source APIs purely via the CONFIG block below — no component code
// needs to change when a real backend is wired up.
// =============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  FlaskConical,
  Bot,
  GitMerge,
  Bug,
  FileBarChart,
  ChevronDown,
  ChevronRight,
  Flag,
  ArrowUp,
  ArrowDown,
  Minus,
  Download,
  Share2,
  FileText,
  AlertTriangle,
  X,
  SlidersHorizontal,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

// =============================================================================
// CONFIG — flip these to move from mock data to a real, multi-source backend.
// =============================================================================
const CONFIG = {
  USE_MOCK: true,

  // Defect/Project Management source — any of these work independently of
  // whatever TC_SOURCE is set to (see backend/src/adapters/ for all of them).
  // "jira" | "azure_devops" | "bugzilla" | "mantis" | "github_issues" | "linear"
  DEFECT_SOURCE: "bugzilla",

  // Test Case Management source — independent of DEFECT_SOURCE.
  // "testlink" | "testrail" | "qtest" | "zephyr_scale" | "practitest" | "kiwi_tcms"
  TC_SOURCE: "kiwi_tcms",

  // CI/Automation Report source (future use)
  // Future: "jenkins" | "github_actions" | "gitlab_ci" | "allure" | "reportportal"
  CI_SOURCE: null,

  API_BASE: "http://localhost:8001/api",

  // Must match BACKEND_API_KEY in backend/.env. This ships to the browser,
  // so it's a defense-in-depth check, not a real secret — fine for an
  // internal/VPN-perimeter deployment, not a substitute for real auth on a
  // public-facing one. Leave "" to match a backend with the check disabled.
  // Never commit a real value here — set it locally per deployment instead.
  API_KEY: "",
};

// =============================================================================
// NORMALISED SCHEMAS — every adapter (current or future) must map its
// source-specific API response into these exact shapes before the UI ever
// sees the data. Components only ever consume normalised objects.
// =============================================================================

// === NORMALISED TICKET SCHEMA ===
// {
//   id: string,                          // "PROJ-123"
//   summary: string,
//   type: "Bug" | "Story" | "Task" | "Improvement" | "Epic",
//   priority: "Critical" | "High" | "Medium" | "Low",
//   status: "Open" | "In Progress" | "Resolved" | "Closed",
//   assignee: string,
//   created_by: string,                  // reporter/creator of the ticket
//   sprint: string,                      // "Sprint 1" | "Sprint 2" | "Sprint 3"
//   labels: string[],
//   linked_tc_ids: string[],             // ["TC-001", "TC-002"]
//   source: string,                      // "jira" | "azure_devops" | etc.
//   type_raw: string | null,             // source's own native value, e.g. "Feature
//   priority_raw: string | null,         // Request" or "P1" — canonical fields above
//   status_raw: string | null,           // stay the source of truth for every KPI/
//                                         // chart/color; *_raw is display-only, shown
//                                         // as a tooltip so you can see what the tool
//                                         // actually called it without it affecting
//                                         // any computation. null where a source has
//                                         // no distinct native concept (e.g. GitHub
//                                         // Issues has no native priority field).
// }

// === NORMALISED TEST CASE SCHEMA ===
// {
//   id: string,                          // "TC-001"
//   title: string,
//   suite: string,                       // "Authentication" | "Payments" | etc.
//   type: "Manual" | "Automated",
//   status: "Passed" | "Failed" | "Blocked" | "Not Run",
//   execution_date: string | null,       // ISO date string
//   assigned_tester: string,
//   build_version: string,
//   linked_jira_ids: string[],
//   automation_script_path: string | null,
//   source: string,                      // "testlink" | "testrail" | etc.
//   status_raw: string | null,           // source's own native execution status
//                                         // string (e.g. "p", "Pass", "PASSED") —
//                                         // display-only, see ticket schema note above.
// }

// === FUTURE: NORMALISED CI RUN SCHEMA ===
// {
//   id: string,
//   pipeline: string,
//   triggered_by: string,
//   status: "Passed" | "Failed" | "Running",
//   tc_results: { tc_id: string, status: string }[],
//   run_date: string,
//   source: string,                      // "jenkins" | "github_actions" | etc.
// }

// =============================================================================
// Design tokens
// =============================================================================
const COLORS = {
  bg: "#0D1117",
  panel: "#161B22",
  altRow: "#21262D",
  accent: "#6E56CF",
  warning: "#F59E0B",
  success: "#22C55E",
  failure: "#EF4444",
  blocked: "#F97316",
  notRun: "#6B7280",
  text: "#F0F6FC",
  textMuted: "#8B949E",
  border: "#30363D",
};

const cx = (...parts) => parts.filter(Boolean).join(" ");

// =============================================================================
// Canonical taxonomies (kept in one place so every page/chart stays in sync)
//
// Suites and sprints are NOT fixed enums — they're whatever labels the
// connected sources happen to use, so the real ones are derived from
// fetched data (see getDistinctSuites / getAllSprints / computeSprintWindows
// further down). The MOCK_* constants below exist only to seed the
// deterministic demo dataset and are never read once data is loaded.
// Ticket type/priority/status/TC status ARE fixed by the normalised schema
// contract, so those stay as real enums.
// =============================================================================
const MOCK_SUITES = ["Authentication", "Payments", "Dashboard", "Reporting"];
const MOCK_SPRINTS = ["Sprint 1", "Sprint 2", "Sprint 3"];
const MOCK_SPRINT_RANGES = {
  "Sprint 1": ["2026-05-04", "2026-05-17"],
  "Sprint 2": ["2026-05-18", "2026-05-31"],
  "Sprint 3": ["2026-06-01", "2026-06-14"],
};

const TICKET_TYPES = ["Bug", "Story", "Task", "Improvement", "Epic"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const TC_STATUSES = ["Passed", "Failed", "Blocked", "Not Run"];

// Mocked Jira/TestLink-style native values for the mock dataset's *_raw
// fields — see the hybrid raw-value tooltip on PriorityPill/StatusPill/
// TypePill. Real adapters populate these from each tool's actual API
// response instead (see backend/src/adapters/).
const MOCK_TYPE_RAW = { Bug: "Bug", Story: "Story", Task: "Task", Improvement: "Enhancement", Epic: "Epic" };
const MOCK_PRIORITY_RAW = { Critical: "Highest", High: "High", Medium: "Medium", Low: "Low" };
const MOCK_STATUS_RAW = { Open: "To Do", "In Progress": "In Progress", Resolved: "Done", Closed: "Closed" };
const MOCK_TC_STATUS_RAW = { Passed: "p", Failed: "f", Blocked: "b", "Not Run": null };

// =============================================================================
// Deterministic PRNG (mulberry32) — keeps the mock dataset stable across
// reloads so sprint-over-sprint deltas don't jitter on every render.
// =============================================================================
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRngHelpers(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pickWeighted = (weighted) => {
    const total = weighted.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [item, w] of weighted) {
      if (r < w) return item;
      r -= w;
    }
    return weighted[weighted.length - 1][0];
  };
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const evenSpread = (n, buckets) => {
    const base = Math.floor(n / buckets.length);
    const rem = n % buckets.length;
    const arr = [];
    buckets.forEach((b, i) => arr.push(...Array(base + (i < rem ? 1 : 0)).fill(b)));
    return shuffle(arr);
  };
  const randomDateInRange = (start, end) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return new Date(s + rng() * (e - s)).toISOString().slice(0, 10);
  };
  return { rng, pick, pickWeighted, shuffle, randInt, evenSpread, randomDateInRange };
}

const pad = (n, len) => String(n).padStart(len, "0");

const TESTERS = [
  "Priya Sharma", "Liam Chen", "Sofia Rossi", "Noah Patel", "Emma Garcia",
  "Ravi Kumar", "Ava Muller", "Mateus Silva", "Hana Kobayashi", "Daniel Cohen",
];
const ASSIGNEES = [...TESTERS, "Unassigned"];
const LABEL_POOL = [
  "regression", "security", "performance", "ui", "backend", "api",
  "flaky", "tech-debt", "customer-reported", "p1-escalation",
];

const SUITE_CONFIG = {
  Authentication: { count: 25, autoRate: 0.7, passTarget: 0.85 },
  Payments: { count: 25, autoRate: 0.6, passTarget: 0.78 },
  Dashboard: { count: 25, autoRate: 0.45, passTarget: 0.68 },
  Reporting: { count: 25, autoRate: 0.35, passTarget: 0.45 }, // intentionally < 60% pass rate
};

const TICKET_TYPE_COUNTS = { Bug: 30, Story: 20, Task: 15, Improvement: 10, Epic: 5 };

const TC_TITLE_VERBS = ["Verify", "Validate", "Check", "Ensure", "Confirm"];
const TC_TITLE_SUBJECTS = [
  "login flow", "session timeout", "payment retry", "refund processing",
  "widget rendering", "report export", "data sync", "access control",
  "rate limiting", "notification delivery",
];
const TICKET_SUMMARY_VERBS = [
  "Login fails on", "Payment timeout during", "Dashboard widget breaks on",
  "Report export missing for", "Session expires unexpectedly on",
  "Refund not processed for", "Rate limit triggered on", "Notification delayed on",
];
const TICKET_SUMMARY_CONTEXTS = [
  "Chrome", "mobile web", "checkout step 2", "weekly digest", "SSO flow",
  "bulk upload", "API v2", "production build",
];

// =============================================================================
// Mock data generator — produces ONE unified, internally-consistent dataset
// shaped exactly like the normalised schemas above. linked_tc_ids on tickets
// and linked_jira_ids on test cases are always kept in sync in both
// directions (verified — see generation step 3 below).
// =============================================================================
function generateMockData() {
  const { pick, pickWeighted, shuffle, randInt, evenSpread, randomDateInRange } = makeRngHelpers(42);

  // --- Step 1: Test cases, grouped by suite ---
  let tcCounter = 1;
  const mockTestCases = [];
  for (const suite of MOCK_SUITES) {
    const cfg = SUITE_CONFIG[suite];
    const autoCount = Math.round(cfg.count * cfg.autoRate);
    const typeFlags = shuffle([
      ...Array(autoCount).fill("Automated"),
      ...Array(cfg.count - autoCount).fill("Manual"),
    ]);

    const passCount = Math.round(cfg.count * cfg.passTarget);
    const remaining = cfg.count - passCount;
    const failCount = Math.round(remaining * 0.45);
    const blockedCount = Math.round(remaining * 0.25);
    const notRunCount = cfg.count - passCount - failCount - blockedCount;
    const statusFlags = shuffle([
      ...Array(passCount).fill("Passed"),
      ...Array(failCount).fill("Failed"),
      ...Array(blockedCount).fill("Blocked"),
      ...Array(notRunCount).fill("Not Run"),
    ]);

    const executedCount = passCount + failCount + blockedCount;
    const execSprints = evenSpread(executedCount, MOCK_SPRINTS);
    let execIdx = 0;

    for (let i = 0; i < cfg.count; i++) {
      const id = `TC-${pad(tcCounter, 3)}`;
      tcCounter++;
      const type = typeFlags[i];
      const status = statusFlags[i];
      let execDate = null;
      if (status !== "Not Run") {
        const sprint = execSprints[execIdx++];
        const [s, e] = MOCK_SPRINT_RANGES[sprint];
        execDate = randomDateInRange(s, e);
      }
      mockTestCases.push({
        id,
        title: `${suite} - ${pick(TC_TITLE_VERBS)} ${pick(TC_TITLE_SUBJECTS)}`,
        suite,
        type,
        status,
        execution_date: execDate,
        assigned_tester: pick(TESTERS),
        build_version: `v1.${randInt(0, 6)}.${randInt(0, 9)}`,
        linked_jira_ids: [],
        automation_script_path: type === "Automated" ? `/automation/${suite.toLowerCase()}/${id.toLowerCase()}.spec.ts` : null,
        source: "testlink",
        // TestLink's real execution status is a single-char code — mocked
        // here too so the hybrid native-value tooltip has something to show.
        status_raw: MOCK_TC_STATUS_RAW[status],
      });
    }
  }

  // --- Step 2: Tickets, grouped by type ---
  let ticketCounter = 1;
  const mockTickets = [];
  for (const type of TICKET_TYPES) {
    const count = TICKET_TYPE_COUNTS[type];
    const typeSprints = evenSpread(count, MOCK_SPRINTS);
    for (let i = 0; i < count; i++) {
      const id = `PROJ-${pad(ticketCounter, 3)}`;
      ticketCounter++;
      const sprint = typeSprints[i];
      let linked_tc_ids = [];
      if (type !== "Epic") {
        // Epics intentionally carry zero TC coverage — drives the
        // "ticket types with 0 TC coverage" attention callout on Overview.
        const linkChance = pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        let n = 0;
        if (linkChance < 1) n = 0; // ~12% of non-epic tickets still get no TCs
        else if (type === "Story") n = randInt(2, 4);
        else if (type === "Task") n = randInt(1, 3);
        else if (type === "Bug") n = randInt(1, 3);
        else if (type === "Improvement") n = randInt(1, 2);
        if (n > 0) {
          linked_tc_ids = shuffle(mockTestCases.map((t) => t.id)).slice(0, n);
        }
      }
      const priority = pickWeighted([["Critical", 0.15], ["High", 0.3], ["Medium", 0.35], ["Low", 0.2]]);
      const status = pick(TICKET_STATUSES);
      mockTickets.push({
        id,
        summary: `${pick(TICKET_SUMMARY_VERBS)} ${pick(TICKET_SUMMARY_CONTEXTS)}`,
        type,
        priority,
        status,
        assignee: pick(ASSIGNEES),
        created_by: pick(TESTERS),
        sprint,
        labels: shuffle(LABEL_POOL).slice(0, randInt(1, 3)),
        linked_tc_ids,
        source: "jira",
        // Mocked Jira-style native values — distinct enough from the
        // canonical buckets above to demonstrate the hybrid raw-value
        // tooltip (e.g. Jira's "To Do"/"Done" workflow names).
        type_raw: MOCK_TYPE_RAW[type],
        priority_raw: MOCK_PRIORITY_RAW[priority],
        status_raw: MOCK_STATUS_RAW[status],
      });
    }
  }

  // --- Step 3: Reverse-populate linked_jira_ids so both directions agree ---
  const tcById = Object.fromEntries(mockTestCases.map((t) => [t.id, t]));
  for (const ticket of mockTickets) {
    for (const tcId of ticket.linked_tc_ids) {
      tcById[tcId].linked_jira_ids.push(ticket.id);
    }
  }

  return { mockTickets, mockTestCases };
}

const { mockTickets, mockTestCases } = generateMockData();

// =============================================================================
// DataService — the ONLY object components are allowed to call for data.
// Mock now; each branch below is the exact contract a backend adapter must
// fulfil to slot a real source in later, with zero UI changes.
// =============================================================================
function authHeaders() {
  return CONFIG.API_KEY ? { "X-API-Key": CONFIG.API_KEY } : {};
}

const DataService = {
  getTickets: async () => {
    if (CONFIG.USE_MOCK) return mockTickets;
    const res = await fetch(`${CONFIG.API_BASE}/${CONFIG.DEFECT_SOURCE}/tickets`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to load tickets from ${CONFIG.DEFECT_SOURCE} (${res.status})`);
    return res.json();
    // Backend adapter maps source-specific response -> Normalised Ticket Schema
    // Jira:        GET /api/jira/tickets         (Jira REST API v3)
    // Azure DevOps: GET /api/azure_devops/tickets (Azure Boards REST API)
    // Bugzilla:    GET /api/bugzilla/tickets      (Bugzilla REST API)
    // Mantis:      GET /api/mantis/tickets        (Mantis REST API)
    // GitHub:      GET /api/github_issues/tickets (GitHub REST API)
  },

  getTestCases: async () => {
    if (CONFIG.USE_MOCK) return mockTestCases;
    const res = await fetch(`${CONFIG.API_BASE}/${CONFIG.TC_SOURCE}/testcases`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to load test cases from ${CONFIG.TC_SOURCE} (${res.status})`);
    return res.json();
    // Backend adapter maps source-specific response -> Normalised TestCase Schema
    // TestLink:  GET /api/testlink/testcases     (TestLink XML-RPC)
    // TestRail:  GET /api/testrail/testcases     (TestRail REST API)
    // qTest:     GET /api/qtest/testcases        (qTest REST API)
    // Zephyr:    GET /api/zephyr_scale/testcases (Zephyr REST API)
    // Kiwi TCMS: GET /api/kiwi_tcms/testcases    (Kiwi REST API)
  },

  getCIResults: async () => {
    if (!CONFIG.CI_SOURCE || CONFIG.USE_MOCK) return null;
    const res = await fetch(`${CONFIG.API_BASE}/${CONFIG.CI_SOURCE}/runs`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to load CI runs from ${CONFIG.CI_SOURCE} (${res.status})`);
    return res.json();
    // Future: Jenkins, GitHub Actions, Allure, ReportPortal
  },
};

// Tickets and test cases each come from their own independent live source,
// and those two systems have no native way to agree on cross-links (e.g. a
// Jira label pointing at a TestLink TC id has no effect on what TestLink's
// own API reports back). The mock dataset is generated already-consistent
// in both directions; real sources generally aren't, so we reconcile here —
// unioning each side's view of the link into both objects — rather than
// trusting either source's linked_tc_ids/linked_jira_ids in isolation.
function reconcileLinks(tickets, testCases) {
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
    const linked = new Set(ticket.linked_tc_ids);
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
// DataContext — fetches once on mount, re-fetches whenever USE_MOCK is
// toggled (wired to the data-source badge in the header for live demo).
// =============================================================================
const DataContext = createContext(null);

function DataProvider({ children }) {
  const [tickets, setTickets] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceErrors, setSourceErrors] = useState({ tickets: null, testCases: null });
  const [useMock, setUseMockFlag] = useState(CONFIG.USE_MOCK);
  const [defectSource, setDefectSourceFlag] = useState(CONFIG.DEFECT_SOURCE);
  const [tcSource, setTcSourceFlag] = useState(CONFIG.TC_SOURCE);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Tickets and test cases come from two independent sources that go live on
  // their own schedules (e.g. Jira configured before TestLink). One source
  // failing shouldn't blank the whole dashboard — only show the full-page
  // error when BOTH fail; otherwise render with whatever did load and
  // surface the gap via sourceErrors.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ticketsResult, testCasesResult] = await Promise.allSettled([DataService.getTickets(), DataService.getTestCases()]);

    const ticketsFailed = ticketsResult.status === "rejected";
    const testCasesFailed = testCasesResult.status === "rejected";

    const reconciled = reconcileLinks(ticketsFailed ? [] : ticketsResult.value, testCasesFailed ? [] : testCasesResult.value);
    setTickets(reconciled.tickets);
    setTestCases(reconciled.testCases);
    setSourceErrors({
      tickets: ticketsFailed ? ticketsResult.reason?.message || "Failed to load tickets" : null,
      testCases: testCasesFailed ? testCasesResult.reason?.message || "Failed to load test cases" : null,
    });
    setError(ticketsFailed && testCasesFailed ? "Failed to load dashboard data" : null);
    if (!(ticketsFailed && testCasesFailed)) setLastUpdated(new Date());
    setLoading(false);
  }, [useMock, defectSource, tcSource]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMock = useCallback(() => {
    CONFIG.USE_MOCK = !CONFIG.USE_MOCK;
    setUseMockFlag(CONFIG.USE_MOCK);
  }, []);

  const setDefectSource = useCallback((value) => {
    CONFIG.DEFECT_SOURCE = value;
    setDefectSourceFlag(value);
  }, []);

  const setTcSource = useCallback((value) => {
    CONFIG.TC_SOURCE = value;
    setTcSourceFlag(value);
  }, []);

  // Derived once per data load from the FULL dataset (not per-filtered-view)
  // so these stay stable as the user applies/clears filters.
  const sprints = useMemo(() => getAllSprints(tickets), [tickets]);
  const { current: currentSprint, previous: previousSprint } = useMemo(() => getCurrentAndPreviousSprint(sprints), [sprints]);
  const sprintWindows = useMemo(() => computeSprintWindows(testCases, sprints), [testCases, sprints]);
  const suites = useMemo(() => getDistinctSuites(testCases), [testCases]);
  const availablePriorities = useMemo(() => getAvailablePriorities(tickets), [tickets]);
  const availableTicketTypes = useMemo(() => getAvailableTicketTypes(tickets), [tickets]);

  const value = useMemo(
    () => ({
      tickets, testCases, loading, error, sourceErrors, useMock, toggleMock, reload: load,
      sprints, currentSprint, previousSprint, sprintWindows, suites, availablePriorities, availableTicketTypes,
      defectSource, setDefectSource, tcSource, setTcSource, lastUpdated,
    }),
    [
      tickets, testCases, loading, error, sourceErrors, useMock, toggleMock, load,
      sprints, currentSprint, previousSprint, sprintWindows, suites, availablePriorities, availableTicketTypes,
      defectSource, setDefectSource, tcSource, setTcSource, lastUpdated,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData() {
  return useContext(DataContext);
}

// =============================================================================
// FilterContext — global header filters, shared by every page.
// =============================================================================
const FilterContext = createContext(null);

const DEFAULT_FILTERS = { sprint: "All Sprints", suites: [], priorities: [], types: [] };

function FilterProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const value = useMemo(() => ({ filters, setFilters }), [filters]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

function useFilters() {
  return useContext(FilterContext);
}

// =============================================================================
// ToastContext — lightweight notifications for the (UI-only) export actions.
// =============================================================================
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const dismiss = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg"
            style={{ background: COLORS.panel, borderColor: COLORS.border, color: COLORS.text }}
          >
            <CheckCircle2 size={16} style={{ color: COLORS.success, flexShrink: 0 }} />
            <span className="text-sm">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-2" style={{ color: COLORS.textMuted }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  return useContext(ToastContext);
}

// =============================================================================
// Computed metrics helpers — pure functions, reused across every page.
// =============================================================================

// Suites are whatever labels the connected TC source actually uses — derive
// them from the data instead of assuming a fixed list.
function getDistinctSuites(testCases) {
  return [...new Set(testCases.map((t) => t.suite).filter(Boolean))].sort();
}

// Priority/type stay fixed canonical buckets (every adapter normalises into
// them — see NORMALISED TICKET SCHEMA), but not every bucket necessarily has
// a ticket in it for the currently connected source. Filter the canonical
// list down to what's actually present so the dropdown doesn't offer dead
// options, same spirit as suites/sprints above.
function getAvailablePriorities(tickets) {
  const present = new Set(tickets.map((t) => t.priority));
  return PRIORITIES.filter((p) => present.has(p));
}
function getAvailableTicketTypes(tickets) {
  const present = new Set(tickets.map((t) => t.type));
  return TICKET_TYPES.filter((t) => present.has(t));
}

// Sprints are whatever labels the connected ticket source actually uses
// (often none at all, if the team doesn't run sprints). "Current"/"previous"
// are simply the last two in sorted order — for mock data ("Sprint 1/2/3")
// that's the same as before; for real data with no sprint field at all,
// both come back null and every sprint-comparison feature degrades
// gracefully (see Delta/KpiCard — they render "—" when value is null).
function getAllSprints(tickets) {
  return [...new Set(tickets.map((t) => t.sprint).filter(Boolean))].sort();
}

function getCurrentAndPreviousSprint(sprints) {
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
function computeSprintWindows(testCases, sprints) {
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

function getTCSprint(tc, sprintWindows, currentSprint) {
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

const WORST_CASE_ORDER = ["Passed", "Not Run", "Blocked", "Failed"];
function worstCaseStatus(statuses) {
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
function tallyByStatus(list, statuses = TC_STATUSES) {
  const counts = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (const item of list) {
    if (item.status in counts) counts[item.status] += 1;
  }
  return counts;
}

function passRate(list) {
  const { Passed: passed, Failed: failed, Blocked: blocked } = tallyByStatus(list);
  const denom = passed + failed + blocked;
  return denom === 0 ? null : (passed / denom) * 100;
}

function automationCoverage(list) {
  if (!list.length) return 0;
  return (list.filter((t) => t.type === "Automated").length / list.length) * 100;
}

function suiteHealth(testCases) {
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
function applyFilters(tickets, testCases, filters, sprintWindows, currentSprint) {
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

function filterForSprint(tickets, testCases, filters, sprintOverride, sprintWindows, currentSprint) {
  if (sprintOverride == null) return { tickets: [], testCases: [] }; // no such sprint (e.g. no "previous" exists yet)
  return applyFilters(tickets, testCases, { ...filters, sprint: sprintOverride }, sprintWindows, currentSprint);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function enumerateDates(start, end) {
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
function tcStatusBreakdown(testCases) {
  const counts = tallyByStatus(testCases);
  return TC_STATUSES.map((status) => ({ name: status, value: counts[status] }));
}

function passRateTrendBySprint(testCases, sprintWindows, currentSprint) {
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
function ticketsBySprintBucket(tickets, sprints) {
  if (sprints.length === 0) return [["All", tickets]];
  return sprints.map((sprint) => [sprint, tickets.filter((t) => t.sprint === sprint)]);
}

function defectsByPriorityCurrentSprint(tickets, currentSprint) {
  const bugs = tickets.filter((t) => t.type === "Bug" && (currentSprint == null || t.sprint === currentSprint));
  return PRIORITIES.map((priority) => ({ priority, count: bugs.filter((t) => t.priority === priority).length }));
}

function passPctPerSuite(testCases) {
  return suiteHealth(testCases).map((s) => ({ suite: s.suite, passPct: Math.round(s.passPct ?? 0) }));
}

function suiteSprintBreakdown(testCases, sprintWindows, currentSprint) {
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

function dailyExecutionTrend(testCases, sprintWindows, currentSprint) {
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

function manualVsAutoPerSprint(testCases, sprintWindows, currentSprint) {
  return Object.keys(sprintWindows).map((sprint) => {
    const list = testCases.filter((tc) => getTCSprint(tc, sprintWindows, currentSprint) === sprint);
    return {
      sprint,
      Manual: list.filter((t) => t.type === "Manual").length,
      Automated: list.filter((t) => t.type === "Automated").length,
    };
  });
}

function suiteAutomationCoverage(testCases) {
  return getDistinctSuites(testCases).map((suite) => {
    const list = testCases.filter((t) => t.suite === suite);
    return { suite, coverage: Math.round(automationCoverage(list)) };
  });
}

function coverageByTicketType(tickets, testCases) {
  const tcById = Object.fromEntries(testCases.map((t) => [t.id, t]));
  return TICKET_TYPES.map((type) => {
    const ticketsOfType = tickets.filter((t) => t.type === type);
    const tcIds = new Set();
    ticketsOfType.forEach((t) => t.linked_tc_ids.forEach((id) => tcIds.add(id)));
    const list = [...tcIds].map((id) => tcById[id]).filter(Boolean);
    return { type, coverage: Math.round(automationCoverage(list)) };
  });
}

function coverageTrendBySprint(testCases, sprintWindows, currentSprint) {
  return Object.keys(sprintWindows).map((sprint) => {
    const list = testCases.filter((tc) => getTCSprint(tc, sprintWindows, currentSprint) === sprint);
    return { sprint, coverage: Math.round(automationCoverage(list)) };
  });
}

function defectsByPriorityPerSprint(tickets, sprints) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  return ticketsBySprintBucket(bugs, sprints).map(([sprint, list]) => ({
    sprint,
    Critical: list.filter((t) => t.priority === "Critical").length,
    High: list.filter((t) => t.priority === "High").length,
    Medium: list.filter((t) => t.priority === "Medium").length,
    Low: list.filter((t) => t.priority === "Low").length,
  }));
}

function bugsByStatus(tickets) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  const counts = tallyByStatus(bugs, TICKET_STATUSES);
  return TICKET_STATUSES.map((status) => ({ name: status, value: counts[status] }));
}

function openVsClosedTrend(tickets, sprints) {
  const bugs = tickets.filter((t) => t.type === "Bug");
  return ticketsBySprintBucket(bugs, sprints).map(([sprint, list]) => ({
    sprint,
    Open: list.filter((t) => t.status === "Open" || t.status === "In Progress").length,
    Closed: list.filter((t) => t.status === "Closed" || t.status === "Resolved").length,
  }));
}

// =============================================================================
// UI primitives
// =============================================================================
const STATUS_COLOR = {
  Passed: COLORS.success,
  Failed: COLORS.failure,
  Blocked: COLORS.blocked,
  "Not Run": COLORS.notRun,
  Open: COLORS.failure,
  "In Progress": COLORS.warning,
  Resolved: COLORS.success,
  Closed: COLORS.notRun,
};

const PRIORITY_COLOR = {
  Critical: COLORS.failure,
  High: COLORS.warning,
  Medium: COLORS.accent,
  Low: COLORS.notRun,
};

const TYPE_COLOR = {
  Bug: COLORS.failure,
  Story: COLORS.success,
  Task: COLORS.accent,
  Improvement: COLORS.warning,
  Epic: COLORS.notRun,
};

function Pill({ color, label, variant = "solid", icon: Icon, title }) {
  if (variant === "dot") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: COLORS.text }} title={title}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
      title={title}
    >
      {Icon && <Icon size={11} />}
      {label}
    </span>
  );
}

// `raw` is the source's own native value for this field (e.g. Jira's
// "Highest" or Bugzilla's "P1" for a priority normalised to "Critical").
// Shown only as a hover tooltip — never affects color, grouping, or any
// computation, which all stay on the canonical label.
function nativeTitle(raw, canonical) {
  return raw && raw !== canonical ? `Native: ${raw}` : undefined;
}

function StatusPill({ status, raw }) {
  return <Pill color={STATUS_COLOR[status] || COLORS.notRun} label={status} title={nativeTitle(raw, status)} />;
}
function PriorityPill({ priority, raw }) {
  return <Pill color={PRIORITY_COLOR[priority] || COLORS.notRun} label={priority} title={nativeTitle(raw, priority)} />;
}
function TypePill({ type, raw }) {
  return <Pill color={TYPE_COLOR[type] || COLORS.notRun} label={type} title={nativeTitle(raw, type)} />;
}
function AutomationPill({ type }) {
  return <Pill color={type === "Automated" ? COLORS.accent : COLORS.notRun} label={type} />;
}

function passPctColor(pct) {
  if (pct == null) return COLORS.notRun;
  if (pct > 80) return COLORS.success;
  if (pct >= 60) return COLORS.warning;
  return COLORS.failure;
}

function Delta({ value, goodDirection = "up", suffix = "%" }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-xs" style={{ color: COLORS.textMuted }}>—</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: COLORS.textMuted }}>
        <Minus size={12} /> 0{suffix}
      </span>
    );
  }
  const isUp = rounded > 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;
  const color = isGood ? COLORS.success : COLORS.failure;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <Icon size={12} />
      {Math.abs(rounded)}
      {suffix}
    </span>
  );
}

function KpiCard({ label, value, delta, goodDirection = "up", suffix = "", previousSprint }) {
  return (
    <div className="rounded-lg p-4 flex flex-col gap-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <span className="text-xs font-medium" style={{ color: COLORS.textMuted }}>{label}</span>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold" style={{ color: COLORS.text }}>{value}{suffix}</span>
        {delta !== undefined && <Delta value={delta} goodDirection={goodDirection} />}
      </div>
      {delta !== undefined && (
        <span className="text-[11px]" style={{ color: COLORS.textMuted }}>vs {previousSprint || "previous sprint"}</span>
      )}
    </div>
  );
}

// A KPI whose entire point IS the delta (e.g. "Coverage delta vs last sprint") —
// renders the signed change itself as the headline stat instead of pairing
// a value with a redundant secondary delta.
function DeltaKpiCard({ label, value, previousSprint }) {
  const hasValue = value != null && !Number.isNaN(value);
  const rounded = hasValue ? Math.round(value * 10) / 10 : null;
  const color = !hasValue ? COLORS.textMuted : rounded > 0 ? COLORS.success : rounded < 0 ? COLORS.failure : COLORS.textMuted;
  const sign = hasValue && rounded > 0 ? "+" : "";
  return (
    <div className="rounded-lg p-4 flex flex-col gap-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <span className="text-xs font-medium" style={{ color: COLORS.textMuted }}>{label}</span>
      <span className="text-2xl font-bold" style={{ color }}>{hasValue ? `${sign}${rounded}%` : "—"}</span>
      <span className="text-[11px]" style={{ color: COLORS.textMuted }}>vs {previousSprint || "previous sprint"}</span>
    </div>
  );
}

function ChartCard({ title, children, height = 260, extra }) {
  return (
    <div className="rounded-lg p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>{title}</h3>
        {extra}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 },
  itemStyle: { color: COLORS.text },
  labelStyle: { color: COLORS.textMuted, marginBottom: 4 },
  cursor: { fill: COLORS.altRow, opacity: 0.4 },
};

function Section({ title, children, right }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold" style={{ color: COLORS.text }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const toggleOption = (opt) => {
    onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
        style={{
          background: selected.length ? `${COLORS.accent}22` : COLORS.altRow,
          color: selected.length ? COLORS.accent : COLORS.text,
          border: `1px solid ${selected.length ? COLORS.accent : COLORS.border}`,
        }}
      >
        {label}
        {selected.length > 0 && <span className="rounded-full px-1.5" style={{ background: COLORS.accent, color: "#fff" }}>{selected.length}</span>}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-40 w-48 rounded-md p-1.5 shadow-xl"
          style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}
        >
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:opacity-80"
              style={{ color: COLORS.text }}
            >
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-left px-2 py-1 text-[11px] mt-1" style={{ color: COLORS.textMuted }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Layout shell — Sidebar, Header, loading/error states
// =============================================================================

function formatTimestamp(date) {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "execution", label: "Test Execution", icon: FlaskConical },
  { key: "automation", label: "Automation", icon: Bot },
  { key: "traceability", label: "Traceability", icon: GitMerge },
  { key: "testers", label: "Testers", icon: Users },
  { key: "defects", label: "Defects", icon: Bug },
  { key: "reports", label: "Reports", icon: FileBarChart },
];

function SourcePill({ label, value, connected = true }) {
  return (
    <div
      className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px]"
      style={{
        background: connected ? `${COLORS.accent}1A` : COLORS.altRow,
        border: `1px solid ${connected ? `${COLORS.accent}55` : COLORS.border}`,
        color: connected ? COLORS.accent : COLORS.textMuted,
      }}
    >
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

const DEFECT_SOURCE_OPTIONS = [
  { value: "jira", label: "Jira" },
  { value: "azure_devops", label: "Azure DevOps" },
  { value: "bugzilla", label: "Bugzilla" },
  { value: "mantis", label: "Mantis" },
  { value: "github_issues", label: "GitHub Issues" },
  { value: "linear", label: "Linear" },
];

const TC_SOURCE_OPTIONS = [
  { value: "testlink", label: "TestLink" },
  { value: "testrail", label: "TestRail" },
  { value: "qtest", label: "qTest" },
  { value: "zephyr_scale", label: "Zephyr Scale" },
  { value: "practitest", label: "PractiTest" },
  { value: "kiwi_tcms", label: "Kiwi TCMS" },
];

// Same visual shell as SourcePill, but an actual control — switches
// CONFIG.DEFECT_SOURCE/TC_SOURCE and triggers a re-fetch, the same pattern
// the header's Mock Data/Live API toggle already uses.
function SourceSelect({ label, value, options, onChange }) {
  return (
    <div
      className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px]"
      style={{ background: `${COLORS.accent}1A`, border: `1px solid ${COLORS.accent}55`, color: COLORS.accent }}
    >
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-semibold bg-transparent outline-none text-right"
        style={{ color: COLORS.accent }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ color: COLORS.text, background: COLORS.panel }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Sidebar({ page, setPage }) {
  const { currentSprint, defectSource, setDefectSource, tcSource, setTcSource } = useData();
  return (
    <aside
      className="flex flex-col shrink-0"
      style={{ width: 240, background: COLORS.panel, borderRight: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-7 w-7 rounded-md flex items-center justify-center font-bold text-sm" style={{ background: COLORS.accent, color: "#fff" }}>
          T
        </div>
        <span className="font-semibold text-sm" style={{ color: COLORS.text }}>TestAtlas</span>
      </div>

      <nav className="flex-1 px-2 mt-2">
        {NAV_ITEMS.map((item) => {
          const active = page === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              aria-current={active ? "page" : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 mb-0.5 rounded-md text-sm font-medium border-l-2 transition-colors"
              style={{
                color: active ? COLORS.accent : COLORS.textMuted,
                borderColor: active ? COLORS.accent : "transparent",
                background: active ? `${COLORS.accent}14` : "transparent",
              }}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4 flex flex-col gap-2">
        <div
          className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-center mb-1"
          style={{ background: `${COLORS.accent}22`, color: COLORS.accent, border: `1px solid ${COLORS.accent}55` }}
        >
          {currentSprint ? `Active: ${currentSprint}` : "No Sprint Data"}
        </div>
        <SourceSelect label="Defects" value={defectSource} options={DEFECT_SOURCE_OPTIONS} onChange={setDefectSource} />
        <SourceSelect label="TCs" value={tcSource} options={TC_SOURCE_OPTIONS} onChange={setTcSource} />
        <SourcePill label="CI" value={CONFIG.CI_SOURCE ? CONFIG.CI_SOURCE : "Not Connected"} connected={!!CONFIG.CI_SOURCE} />
      </div>
    </aside>
  );
}

function Header() {
  const { filters, setFilters } = useFilters();
  const { useMock, toggleMock, sprints, suites, availablePriorities, availableTicketTypes, lastUpdated } = useData();

  return (
    <header
      className="flex items-center justify-between gap-4 px-5 shrink-0"
      style={{ height: 56, background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={14} style={{ color: COLORS.textMuted }} />
        <select
          value={filters.sprint}
          onChange={(e) => setFilters((f) => ({ ...f, sprint: e.target.value }))}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium outline-none"
          style={{ background: COLORS.altRow, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
        >
          <option>All Sprints</option>
          {sprints.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <MultiSelectDropdown label="Suite" options={suites} selected={filters.suites} onChange={(v) => setFilters((f) => ({ ...f, suites: v }))} />
        <MultiSelectDropdown label="Priority" options={availablePriorities} selected={filters.priorities} onChange={(v) => setFilters((f) => ({ ...f, priorities: v }))} />
        <MultiSelectDropdown label="Ticket Type" options={availableTicketTypes} selected={filters.types} onChange={(v) => setFilters((f) => ({ ...f, types: v }))} />
        {(filters.suites.length > 0 || filters.priorities.length > 0 || filters.types.length > 0 || filters.sprint !== "All Sprints") && (
          <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs underline" style={{ color: COLORS.textMuted }}>
            Reset
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <time
          aria-live="polite"
          aria-atomic="true"
          dateTime={lastUpdated ? lastUpdated.toISOString() : undefined}
          className="text-xs"
          style={{ color: COLORS.textMuted }}
        >
          {lastUpdated ? `Updated ${formatTimestamp(lastUpdated)}` : ""}
        </time>

        <button
          onClick={toggleMock}
          title="Click to toggle mock/live mode (demo)"
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            background: useMock ? `${COLORS.success}1F` : `${COLORS.warning}1F`,
            color: useMock ? COLORS.success : COLORS.warning,
            border: `1px solid ${useMock ? COLORS.success : COLORS.warning}55`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: useMock ? COLORS.success : COLORS.warning }} />
          {useMock ? "Mock Data" : "Live API"}
        </button>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32" style={{ color: COLORS.textMuted }}>
      <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
      <span className="text-sm">Loading dashboard data…</span>
    </div>
  );
}

function ErrorState({ error }) {
  const { reload, toggleMock, useMock } = useData();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-center max-w-md mx-auto">
      <AlertTriangle size={28} style={{ color: COLORS.failure }} />
      <span className="text-sm font-medium" style={{ color: COLORS.text }}>Couldn't load dashboard data</span>
      <span className="text-xs" style={{ color: COLORS.textMuted }}>{error}</span>
      <div className="flex gap-2 mt-2">
        <button
          onClick={reload}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: COLORS.altRow, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
        >
          <RefreshCw size={12} /> Retry
        </button>
        {!useMock && (
          <button
            onClick={toggleMock}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: `${COLORS.accent}22`, color: COLORS.accent, border: `1px solid ${COLORS.accent}55` }}
          >
            Switch back to Mock Data
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PAGE 1 — Overview
// =============================================================================
function overviewKpis(tickets, testCases) {
  const { Passed: passed, Failed: failed, Blocked: blocked, "Not Run": notRun } = tallyByStatus(testCases);
  const denom = passed + failed + blocked;
  return {
    total: testCases.length,
    passPct: denom ? (passed / denom) * 100 : 0,
    failPct: denom ? (failed / denom) * 100 : 0,
    blocked,
    notRun,
    openDefects: tickets.filter((t) => t.type === "Bug" && (t.status === "Open" || t.status === "In Progress")).length,
    criticalBugs: tickets.filter((t) => t.type === "Bug" && t.priority === "Critical").length,
    autoCoverage: automationCoverage(testCases),
  };
}

function AttentionCard({ icon: Icon, title, items, emptyText, renderItem }) {
  return (
    <div className="rounded-lg p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} style={{ color: items.length ? COLORS.warning : COLORS.success }} />
        <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs flex items-center gap-1.5" style={{ color: COLORS.textMuted }}>
          <CheckCircle2 size={13} style={{ color: COLORS.success }} /> {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">{items.map(renderItem)}</div>
      )}
    </div>
  );
}

function OverviewPage() {
  const { tickets, testCases, sprintWindows, currentSprint, previousSprint } = useData();
  const { filters } = useFilters();
  const hasComparison = previousSprint != null;

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const currentSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, currentSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const prevSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, previousSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint, previousSprint]);

  const view = useMemo(() => overviewKpis(filtered.tickets, filtered.testCases), [filtered]);
  const cur = useMemo(() => overviewKpis(currentSprintData.tickets, currentSprintData.testCases), [currentSprintData]);
  const prev = useMemo(() => overviewKpis(prevSprintData.tickets, prevSprintData.testCases), [prevSprintData]);

  const donutData = useMemo(() => tcStatusBreakdown(filtered.testCases), [filtered]);
  const trendData = useMemo(() => passRateTrendBySprint(filtered.testCases, sprintWindows, currentSprint), [filtered, sprintWindows, currentSprint]);
  const priorityBarData = useMemo(() => defectsByPriorityCurrentSprint(filtered.tickets, currentSprint), [filtered, currentSprint]);
  const suitePassData = useMemo(() => passPctPerSuite(filtered.testCases), [filtered]);

  const suitesBelow60 = useMemo(() => suiteHealth(filtered.testCases).filter((s) => s.passPct != null && s.passPct < 60), [filtered]);
  const typesWithZeroCoverage = useMemo(
    () =>
      TICKET_TYPES.filter((type) => {
        const list = filtered.tickets.filter((t) => t.type === type);
        return list.length > 0 && list.every((t) => t.linked_tc_ids.length === 0);
      }),
    [filtered]
  );
  const failedAutomated = useMemo(() => filtered.testCases.filter((t) => t.type === "Automated" && t.status === "Failed"), [filtered]);

  return (
    <div>
      <Section title="Key Metrics">
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Total TCs" value={view.total} delta={hasComparison ? cur.total - prev.total : undefined} suffix="" previousSprint={previousSprint} />
          <KpiCard label="Pass Rate" value={Math.round(view.passPct)} delta={hasComparison ? cur.passPct - prev.passPct : undefined} suffix="%" previousSprint={previousSprint} />
          <KpiCard label="Fail Rate" value={Math.round(view.failPct)} delta={hasComparison ? cur.failPct - prev.failPct : undefined} suffix="%" goodDirection="down" previousSprint={previousSprint} />
          <KpiCard label="Blocked" value={view.blocked} delta={hasComparison ? cur.blocked - prev.blocked : undefined} suffix="" goodDirection="down" previousSprint={previousSprint} />
          <KpiCard label="Not Run" value={view.notRun} delta={hasComparison ? cur.notRun - prev.notRun : undefined} suffix="" goodDirection="down" previousSprint={previousSprint} />
          <KpiCard label="Open Defects" value={view.openDefects} delta={hasComparison ? cur.openDefects - prev.openDefects : undefined} suffix="" goodDirection="down" previousSprint={previousSprint} />
          <KpiCard label="Critical Bugs" value={view.criticalBugs} delta={hasComparison ? cur.criticalBugs - prev.criticalBugs : undefined} suffix="" goodDirection="down" previousSprint={previousSprint} />
          <KpiCard label="Automation Coverage" value={Math.round(view.autoCoverage)} delta={hasComparison ? cur.autoCoverage - prev.autoCoverage : undefined} suffix="%" previousSprint={previousSprint} />
        </div>
      </Section>

      <Section title="Trends">
        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="TC Status Breakdown">
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {donutData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLOR[entry.name]} stroke="none" />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
            </PieChart>
          </ChartCard>

          <ChartCard title="Pass Rate Trend by Sprint (Manual vs Automated)">
            <LineChart data={trendData}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="sprint" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
              <Line type="monotone" dataKey="Manual" stroke={COLORS.notRun} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Automated" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>

          <ChartCard title={`Defects by Priority (${currentSprint || "All Data"})`}>
            <BarChart data={priorityBarData}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="priority" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {priorityBarData.map((entry) => (
                  <Cell key={entry.priority} fill={PRIORITY_COLOR[entry.priority]} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Pass % per Suite">
            <BarChart data={suitePassData}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="suite" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="passPct" radius={[4, 4, 0, 0]}>
                {suitePassData.map((entry) => (
                  <Cell key={entry.suite} fill={passPctColor(entry.passPct)} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        </div>
      </Section>

      <Section title="Attention Required">
        <div className="grid grid-cols-3 gap-4">
          <AttentionCard
            icon={AlertTriangle}
            title="Suites Below 60% Pass Rate"
            items={suitesBelow60}
            emptyText="All suites are healthy"
            renderItem={(s) => (
              <div key={s.suite} className="flex items-center justify-between text-xs">
                <span style={{ color: COLORS.text }}>{s.suite}</span>
                <Pill color={COLORS.failure} label={`${Math.round(s.passPct)}%`} />
              </div>
            )}
          />
          <AttentionCard
            icon={AlertTriangle}
            title="Ticket Types with 0 TC Coverage"
            items={typesWithZeroCoverage}
            emptyText="Every ticket type has coverage"
            renderItem={(type) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span style={{ color: COLORS.text }}>{type}</span>
                <Pill color={COLORS.warning} label="0 TCs" />
              </div>
            )}
          />
          <AttentionCard
            icon={AlertTriangle}
            title="Automated TCs Failing Last Run"
            items={failedAutomated}
            emptyText="No automated failures"
            renderItem={(tc) => (
              <div key={tc.id} className="flex items-center justify-between text-xs gap-2">
                <span style={{ color: COLORS.text }} className="truncate">{tc.id} · {tc.title}</span>
                <Pill color={COLORS.failure} label="Failed" />
              </div>
            )}
          />
        </div>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE 2 — Test Execution
// =============================================================================
function Table({ columns, children, emptyMessage = "No data matches the current filters." }) {
  const isEmpty = React.Children.count(children) === 0;
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: COLORS.altRow }}>
            {columns.map((c, i) => (
              <th key={`${c}-${i}`} scope="col" className="text-left px-3 py-2.5 font-semibold" style={{ color: COLORS.textMuted }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center" style={{ color: COLORS.textMuted }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

function TestExecutionPage() {
  const { tickets, testCases, sprintWindows, currentSprint } = useData();
  const { filters } = useFilters();
  const [expandedSuite, setExpandedSuite] = useState(null);

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const health = useMemo(() => suiteHealth(filtered.testCases), [filtered]);

  const kpis = useMemo(() => {
    const { Passed: passed, Failed: failed, Blocked: blocked, "Not Run": notRun } = tallyByStatus(filtered.testCases);
    return { executed: passed + failed + blocked, passed, failed, blocked, remaining: notRun };
  }, [filtered]);

  const suiteSprintData = useMemo(() => suiteSprintBreakdown(filtered.testCases, sprintWindows, currentSprint), [filtered, sprintWindows, currentSprint]);
  const dailyTrend = useMemo(() => dailyExecutionTrend(filtered.testCases, sprintWindows, currentSprint), [filtered, sprintWindows, currentSprint]);
  const manualAutoData = useMemo(() => manualVsAutoPerSprint(filtered.testCases, sprintWindows, currentSprint), [filtered, sprintWindows, currentSprint]);

  return (
    <div>
      <Section title="Execution Summary">
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="Executed" value={kpis.executed} suffix="" />
          <KpiCard label="Passed" value={kpis.passed} suffix="" />
          <KpiCard label="Failed" value={kpis.failed} suffix="" />
          <KpiCard label="Blocked" value={kpis.blocked} suffix="" />
          <KpiCard label="Remaining" value={kpis.remaining} suffix="" />
        </div>
      </Section>

      <Section title="Execution Trends">
        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Pass/Fail/Blocked/Not Run per Suite x Sprint" height={300}>
            <BarChart data={suiteSprintData} margin={{ bottom: 24 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={{ stroke: COLORS.border }} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
              <Bar dataKey="Passed" stackId="a" fill={COLORS.success} />
              <Bar dataKey="Failed" stackId="a" fill={COLORS.failure} />
              <Bar dataKey="Blocked" stackId="a" fill={COLORS.blocked} />
              <Bar dataKey="Not Run" stackId="a" fill={COLORS.notRun} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title={`Daily Execution Trend (${currentSprint || "Current"})`} height={300}>
            <LineChart data={dailyTrend}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} interval={1} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
              <Line type="monotone" dataKey="Executed" stroke={COLORS.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Passed" stroke={COLORS.success} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Manual vs Automated per Sprint">
            <BarChart data={manualAutoData}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="sprint" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
              <Bar dataKey="Manual" stackId="b" fill={COLORS.notRun} />
              <Bar dataKey="Automated" stackId="b" fill={COLORS.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      </Section>

      <Section title="Suite Health">
        <Table columns={["", "Suite", "Total", "Passed", "Failed", "Blocked", "Not Run", "Pass%", "Last Run"]}>
          {health.map((s) => {
            const isOpen = expandedSuite === s.suite;
            const suiteTCs = filtered.testCases.filter((t) => t.suite === s.suite);
            return (
              <React.Fragment key={s.suite}>
                <tr
                  onClick={() => setExpandedSuite(isOpen ? null : s.suite)}
                  className="cursor-pointer"
                  style={{ borderTop: `1px solid ${COLORS.border}`, background: isOpen ? COLORS.altRow : "transparent" }}
                >
                  <td className="px-3 py-2.5" style={{ color: COLORS.textMuted }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: COLORS.text }}>{s.suite}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.text }}>{s.total}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.success }}>{s.passed}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.failure }}>{s.failed}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.blocked }}>{s.blocked}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.notRun }}>{s.notRun}</td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: passPctColor(s.passPct) }}>
                    {s.passPct == null ? "—" : `${Math.round(s.passPct)}%`}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.textMuted }}>{formatDate(s.lastRun)}</td>
                </tr>
                {isOpen && (
                  <tr style={{ background: COLORS.bg }}>
                    <td colSpan={9} className="p-3">
                      <Table columns={["TC ID", "Title", "Type", "Status", "Assignee", "Last Executed"]}>
                        {suiteTCs.map((tc, i) => (
                          <tr key={tc.id} style={{ background: i % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
                            <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.id}</td>
                            <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.title}</td>
                            <td className="px-3 py-2"><AutomationPill type={tc.type} /></td>
                            <td className="px-3 py-2"><StatusPill status={tc.status} raw={tc.status_raw} /></td>
                            <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{tc.assigned_tester}</td>
                            <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{formatDate(tc.execution_date)}</td>
                          </tr>
                        ))}
                      </Table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE 3 — Automation
// =============================================================================
function uncoveredPriorityColor(priority) {
  if (priority === "Critical" || priority === "High") return COLORS.failure;
  if (priority === "Medium") return COLORS.warning;
  return COLORS.notRun;
}

// "Uncovered" here means automation-uncovered: Manual TCs are the gap this
// page exists to surface, ranked by the priority of the Jira ticket they're
// tied to so the highest-risk manual tests bubble to the top.
function buildUncoveredRows(tickets, testCases) {
  const ticketById = Object.fromEntries(tickets.map((t) => [t.id, t]));
  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const rows = testCases
    .filter((tc) => tc.type === "Manual")
    .map((tc) => ({ tc, linkedTicket: tc.linked_jira_ids.length ? ticketById[tc.linked_jira_ids[0]] : null }));
  rows.sort((a, b) => {
    const ra = a.linkedTicket ? rank[a.linkedTicket.priority] : 4;
    const rb = b.linkedTicket ? rank[b.linkedTicket.priority] : 4;
    return ra - rb;
  });
  return rows;
}

function AutomationPage() {
  const { tickets, testCases, sprintWindows, currentSprint, previousSprint } = useData();
  const { filters } = useFilters();

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const currentSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, currentSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const prevSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, previousSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint, previousSprint]);

  const kpis = useMemo(() => {
    const automated = filtered.testCases.filter((t) => t.type === "Automated");
    const manual = filtered.testCases.filter((t) => t.type === "Manual");
    return {
      totalAutomated: automated.length,
      totalManual: manual.length,
      coverage: automationCoverage(filtered.testCases),
      automatedPassRate: passRate(automated) ?? 0,
      failedAutomated: automated.filter((t) => t.status === "Failed").length,
    };
  }, [filtered]);

  const coverageDelta = useMemo(
    () => (previousSprint == null ? null : automationCoverage(currentSprintData.testCases) - automationCoverage(prevSprintData.testCases)),
    [currentSprintData, prevSprintData, previousSprint]
  );

  const suiteCoverage = useMemo(() => suiteAutomationCoverage(filtered.testCases), [filtered]);
  const typeCoverage = useMemo(() => coverageByTicketType(filtered.tickets, filtered.testCases), [filtered]);
  const coverageTrend = useMemo(() => coverageTrendBySprint(filtered.testCases, sprintWindows, currentSprint), [filtered, sprintWindows, currentSprint]);
  const uncoveredRows = useMemo(() => buildUncoveredRows(filtered.tickets, filtered.testCases), [filtered]);

  return (
    <div>
      <Section title="Automation Summary">
        <div className="grid grid-cols-6 gap-3">
          <KpiCard label="Total Automated" value={kpis.totalAutomated} suffix="" />
          <KpiCard label="Total Manual" value={kpis.totalManual} suffix="" />
          <KpiCard label="Coverage" value={Math.round(kpis.coverage)} suffix="%" />
          <KpiCard label="Automated Pass Rate" value={Math.round(kpis.automatedPassRate)} suffix="%" />
          <KpiCard label="Failed Automated" value={kpis.failedAutomated} suffix="" goodDirection="down" />
          <DeltaKpiCard label="Coverage Δ vs Last Sprint" value={coverageDelta} previousSprint={previousSprint} />
        </div>
      </Section>

      <Section title="Coverage Breakdown">
        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Coverage % per Suite">
            <BarChart data={suiteCoverage} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <YAxis type="category" dataKey="suite" tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="coverage" radius={[0, 4, 4, 0]}>
                {suiteCoverage.map((entry) => (
                  <Cell key={entry.suite} fill={entry.coverage >= 50 ? COLORS.accent : COLORS.warning} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Coverage % per Jira Ticket Type">
            <BarChart data={typeCoverage}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="type" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="coverage" radius={[4, 4, 0, 0]}>
                {typeCoverage.map((entry) => (
                  <Cell key={entry.type} fill={entry.coverage >= 50 ? COLORS.accent : COLORS.warning} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          <div className="col-span-2">
            <ChartCard title="Coverage % Trend Across Sprints">
              <LineChart data={coverageTrend}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sprint" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="coverage" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ChartCard>
          </div>
        </div>
      </Section>

      <Section title="Uncovered TCs (Manual — Automation Gap)">
        <Table columns={["", "TC ID", "Title", "Suite", "Linked Jira ID", "Jira Type", "Priority", "Status"]}>
          {uncoveredRows.map(({ tc, linkedTicket }, i) => (
            <tr key={tc.id} style={{ background: i % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
              <td className="px-3 py-2"><Flag size={12} style={{ color: linkedTicket ? uncoveredPriorityColor(linkedTicket.priority) : COLORS.notRun }} /></td>
              <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.id}</td>
              <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.title}</td>
              <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{tc.suite}</td>
              <td className="px-3 py-2" style={{ color: COLORS.text }}>{linkedTicket ? linkedTicket.id : "—"}</td>
              <td className="px-3 py-2">{linkedTicket ? <TypePill type={linkedTicket.type} raw={linkedTicket.type_raw} /> : <span style={{ color: COLORS.textMuted }}>—</span>}</td>
              <td className="px-3 py-2">
                {linkedTicket ? <Pill color={uncoveredPriorityColor(linkedTicket.priority)} label={linkedTicket.priority} title={nativeTitle(linkedTicket.priority_raw, linkedTicket.priority)} /> : <span style={{ color: COLORS.textMuted }}>Unlinked</span>}
              </td>
              <td className="px-3 py-2"><StatusPill status={tc.status} raw={tc.status_raw} /></td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE 4 — Traceability
// =============================================================================
function coveragePctByType(tickets) {
  return TICKET_TYPES.map((type) => {
    const list = tickets.filter((t) => t.type === type);
    const withTC = list.filter((t) => t.linked_tc_ids.length > 0).length;
    return { type, pct: list.length ? (withTC / list.length) * 100 : 0 };
  });
}

// Groups test cases by their assigned tester, then rolls up the issues
// linked to that tester's test cases — answers "who's testing what, and
// what defects are showing up against their work."
function testerStats(testCases, tickets) {
  const ticketById = Object.fromEntries(tickets.map((t) => [t.id, t]));
  const byTester = {};
  for (const tc of testCases) {
    const name = tc.assigned_tester || "Unassigned";
    (byTester[name] ||= []).push(tc);
  }

  return Object.entries(byTester)
    .map(([tester, tcs]) => {
      const linkedIssueIds = [...new Set(tcs.flatMap((t) => t.linked_jira_ids))];
      const linkedIssues = linkedIssueIds.map((id) => ticketById[id]).filter(Boolean);
      const { Passed: passed, Failed: failed, Blocked: blocked, "Not Run": notRun } = tallyByStatus(tcs);
      return {
        tester,
        tcs,
        total: tcs.length,
        passed,
        failed,
        blocked,
        notRun,
        passPct: passRate(tcs),
        linkedIssues,
        criticalHighCount: linkedIssues.filter((i) => i.priority === "Critical" || i.priority === "High").length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function ToggleChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-xs font-medium"
      style={{
        background: active ? COLORS.accent : COLORS.altRow,
        color: active ? "#fff" : COLORS.textMuted,
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
      }}
    >
      {label}
    </button>
  );
}

function TraceabilityPage() {
  const { tickets, testCases, sprintWindows, currentSprint } = useData();
  const { filters } = useFilters();
  const [typeToggle, setTypeToggle] = useState("All");
  const [expandedTicket, setExpandedTicket] = useState(null);

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const tcById = useMemo(() => Object.fromEntries(testCases.map((t) => [t.id, t])), [testCases]);
  const rows = useMemo(
    () => filtered.tickets.filter((t) => typeToggle === "All" || t.type === typeToggle),
    [filtered, typeToggle]
  );
  const coveragePanel = useMemo(() => coveragePctByType(filtered.tickets), [filtered]);

  return (
    <div>
      <Section
        title="Traceability Matrix"
        right={
          <div className="flex gap-1.5">
            <ToggleChip active={typeToggle === "All"} label="All" onClick={() => setTypeToggle("All")} />
            {TICKET_TYPES.map((type) => (
              <ToggleChip key={type} active={typeToggle === type} label={type} onClick={() => setTypeToggle(type)} />
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-3">
            <Table columns={["", "Jira ID", "Type", "Summary", "Priority", "Sprint", "Assignee", "Linked TCs", "Worst Status", "Auto Coverage"]}>
              {rows.map((ticket, i) => {
                const linkedTCs = ticket.linked_tc_ids.map((id) => tcById[id]).filter(Boolean);
                const noCoverage = linkedTCs.length === 0;
                const worst = worstCaseStatus(linkedTCs.map((tc) => tc.status));
                const coverage = automationCoverage(linkedTCs);
                const isOpen = expandedTicket === ticket.id;
                return (
                  <React.Fragment key={ticket.id}>
                    <tr
                      onClick={() => setExpandedTicket(isOpen ? null : ticket.id)}
                      className="cursor-pointer"
                      style={{
                        background: i % 2 ? COLORS.altRow : "transparent",
                        borderTop: `1px solid ${COLORS.border}`,
                        borderLeft: noCoverage ? `3px solid ${COLORS.warning}` : "3px solid transparent",
                      }}
                    >
                      <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: COLORS.text }}>{ticket.id}</td>
                      <td className="px-3 py-2"><TypePill type={ticket.type} raw={ticket.type_raw} /></td>
                      <td className="px-3 py-2 max-w-xs truncate" style={{ color: COLORS.text }}>{ticket.summary}</td>
                      <td className="px-3 py-2"><PriorityPill priority={ticket.priority} raw={ticket.priority_raw} /></td>
                      <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{ticket.sprint}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{ticket.assignee}</td>
                      <td className="px-3 py-2" style={{ color: COLORS.text }}>{linkedTCs.length}</td>
                      <td className="px-3 py-2">
                        {noCoverage ? <Pill color={COLORS.warning} label="No Coverage" /> : <StatusPill status={worst} />}
                      </td>
                      <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{noCoverage ? "—" : `${Math.round(coverage)}%`}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: COLORS.bg }}>
                        <td colSpan={10} className="p-3">
                          {linkedTCs.length === 0 ? (
                            <p className="text-xs px-2" style={{ color: COLORS.textMuted }}>No test cases linked to this ticket.</p>
                          ) : (
                            <Table columns={["TC ID", "Title", "Type", "Status"]}>
                              {linkedTCs.map((tc, j) => (
                                <tr key={tc.id} style={{ background: j % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
                                  <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.id}</td>
                                  <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.title}</td>
                                  <td className="px-3 py-2"><AutomationPill type={tc.type} /></td>
                                  <td className="px-3 py-2"><StatusPill status={tc.status} raw={tc.status_raw} /></td>
                                </tr>
                              ))}
                            </Table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </Table>
          </div>

          <div className="rounded-lg p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>Coverage by Ticket Type</h3>
            <p className="text-[11px] mb-3" style={{ color: COLORS.textMuted }}>% of tickets with ≥1 linked TC</p>
            <div className="flex flex-col gap-3">
              {coveragePanel.map((row) => (
                <div key={row.type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: COLORS.text }}>{row.type}</span>
                    <span style={{ color: COLORS.textMuted }}>{Math.round(row.pct)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.altRow }}>
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.pct === 0 ? COLORS.warning : COLORS.accent }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE — Testers
// Who's testing what, and what defects are showing up against their work.
// =============================================================================
function TestersPage() {
  const { tickets, testCases, sprintWindows, currentSprint } = useData();
  const { filters } = useFilters();
  const [expandedTester, setExpandedTester] = useState(null);

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const stats = useMemo(() => testerStats(filtered.testCases, filtered.tickets), [filtered]);

  const summary = useMemo(() => {
    const named = stats.filter((s) => s.tester !== "Unassigned");
    const avgPassPct = named.length ? named.reduce((sum, s) => sum + (s.passPct ?? 0), 0) / named.length : 0;
    const totalLinkedIssues = new Set(stats.flatMap((s) => s.linkedIssues.map((i) => i.id))).size;
    const totalCriticalHigh = stats.reduce((sum, s) => sum + s.criticalHighCount, 0);
    return { testerCount: named.length, avgPassPct, totalLinkedIssues, totalCriticalHigh };
  }, [stats]);

  return (
    <div>
      <Section title="Tester Summary">
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="Testers" value={summary.testerCount} suffix="" />
          <KpiCard label="Avg Pass Rate" value={Math.round(summary.avgPassPct)} suffix="%" />
          <KpiCard label="Linked Defects" value={summary.totalLinkedIssues} suffix="" />
          <KpiCard label="Critical/High Linked" value={summary.totalCriticalHigh} suffix="" goodDirection="down" />
        </div>
      </Section>

      <Section title="By Tester">
        <Table columns={["", "Tester", "Assigned TCs", "Passed", "Failed", "Blocked", "Not Run", "Pass%", "Linked Defects", "Critical/High"]}>
          {stats.map((s, i) => {
            const isOpen = expandedTester === s.tester;
            return (
              <React.Fragment key={s.tester}>
                <tr
                  onClick={() => setExpandedTester(isOpen ? null : s.tester)}
                  className="cursor-pointer"
                  style={{ background: i % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}
                >
                  <td className="px-3 py-2.5" style={{ color: COLORS.textMuted }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: COLORS.text }}>{s.tester}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.text }}>{s.total}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.success }}>{s.passed}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.failure }}>{s.failed}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.blocked }}>{s.blocked}</td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.notRun }}>{s.notRun}</td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: passPctColor(s.passPct) }}>
                    {s.passPct == null ? "—" : `${Math.round(s.passPct)}%`}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: COLORS.text }}>{s.linkedIssues.length}</td>
                  <td className="px-3 py-2.5">
                    {s.criticalHighCount > 0 ? <Pill color={COLORS.failure} label={s.criticalHighCount} /> : <span style={{ color: COLORS.textMuted }}>—</span>}
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ background: COLORS.bg }}>
                    <td colSpan={10} className="p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>Assigned Test Cases</h4>
                          <Table columns={["TC ID", "Title", "Suite", "Type", "Status"]}>
                            {s.tcs.map((tc, j) => (
                              <tr key={tc.id} style={{ background: j % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
                                <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.id}</td>
                                <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.title}</td>
                                <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{tc.suite}</td>
                                <td className="px-3 py-2"><AutomationPill type={tc.type} /></td>
                                <td className="px-3 py-2"><StatusPill status={tc.status} raw={tc.status_raw} /></td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: COLORS.textMuted }}>Linked Defects/Tickets</h4>
                          {s.linkedIssues.length === 0 ? (
                            <p className="text-xs px-2" style={{ color: COLORS.textMuted }}>No issues linked to this tester's test cases.</p>
                          ) : (
                            <Table columns={["Jira ID", "Summary", "Priority", "Status"]}>
                              {s.linkedIssues.map((issue, j) => (
                                <tr key={issue.id} style={{ background: j % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
                                  <td className="px-3 py-2" style={{ color: COLORS.text }}>{issue.id}</td>
                                  <td className="px-3 py-2 max-w-xs truncate" style={{ color: COLORS.text }}>{issue.summary}</td>
                                  <td className="px-3 py-2"><PriorityPill priority={issue.priority} raw={issue.priority_raw} /></td>
                                  <td className="px-3 py-2"><StatusPill status={issue.status} raw={issue.status_raw} /></td>
                                </tr>
                              ))}
                            </Table>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE 5 — Defects
// =============================================================================

function DefectsPage() {
  const { tickets, testCases, sprintWindows, currentSprint, sprints } = useData();
  const { filters } = useFilters();
  const [priorityTab, setPriorityTab] = useState("All");
  const [expandedTicket, setExpandedTicket] = useState(null);

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const tcById = useMemo(() => Object.fromEntries(testCases.map((t) => [t.id, t])), [testCases]);
  const bugs = useMemo(() => filtered.tickets.filter((t) => t.type === "Bug"), [filtered]);

  const kpis = useMemo(() => {
    const { Open: open, "In Progress": inProgress, Resolved: resolved, Closed: closed } = tallyByStatus(bugs, TICKET_STATUSES);
    return {
      total: bugs.length,
      open,
      inProgress,
      resolved,
      closed,
      criticalOpen: bugs.filter((t) => t.priority === "Critical" && (t.status === "Open" || t.status === "In Progress")).length,
    };
  }, [bugs]);

  const priorityPerSprint = useMemo(() => defectsByPriorityPerSprint(filtered.tickets, sprints), [filtered, sprints]);
  const statusPie = useMemo(() => bugsByStatus(filtered.tickets), [filtered]);
  const openClosedTrend = useMemo(() => openVsClosedTrend(filtered.tickets, sprints), [filtered, sprints]);

  const tableRows = useMemo(
    () => bugs.filter((t) => priorityTab === "All" || t.priority === priorityTab),
    [bugs, priorityTab]
  );

  return (
    <div>
      <Section title="Defect Summary">
        <div className="grid grid-cols-6 gap-3">
          <KpiCard label="Total Bugs" value={kpis.total} suffix="" />
          <KpiCard label="Open" value={kpis.open} suffix="" goodDirection="down" />
          <KpiCard label="In Progress" value={kpis.inProgress} suffix="" />
          <KpiCard label="Resolved" value={kpis.resolved} suffix="" />
          <KpiCard label="Closed" value={kpis.closed} suffix="" />
          <KpiCard label="Critical Open" value={kpis.criticalOpen} suffix="" goodDirection="down" />
        </div>
      </Section>

      <Section title="Defect Trends">
        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Bugs by Priority per Sprint">
            <BarChart data={priorityPerSprint}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="sprint" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
              <Bar dataKey="Critical" stackId="p" fill={PRIORITY_COLOR.Critical} />
              <Bar dataKey="High" stackId="p" fill={PRIORITY_COLOR.High} />
              <Bar dataKey="Medium" stackId="p" fill={PRIORITY_COLOR.Medium} />
              <Bar dataKey="Low" stackId="p" fill={PRIORITY_COLOR.Low} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Bugs by Status">
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={0} outerRadius={85} paddingAngle={2}>
                {statusPie.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLOR[entry.name]} stroke="none" />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
            </PieChart>
          </ChartCard>

          <div className="col-span-2">
            <ChartCard title="Open vs Closed Trend">
              <LineChart data={openClosedTrend}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sprint" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
                <Line type="monotone" dataKey="Open" stroke={COLORS.failure} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Closed" stroke={COLORS.success} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartCard>
          </div>
        </div>
      </Section>

      <Section
        title="Defects"
        right={
          <div className="flex gap-1.5">
            <ToggleChip active={priorityTab === "All"} label="All" onClick={() => setPriorityTab("All")} />
            {PRIORITIES.map((p) => (
              <ToggleChip key={p} active={priorityTab === p} label={p} onClick={() => setPriorityTab(p)} />
            ))}
          </div>
        }
      >
        <Table columns={["", "Jira ID", "Summary", "Priority", "Status", "Assignee", "Created By", "Sprint", "Linked TCs", "TC Status"]}>
          {tableRows.map((ticket, i) => {
            const linkedTCs = ticket.linked_tc_ids.map((id) => tcById[id]).filter(Boolean);
            const worst = worstCaseStatus(linkedTCs.map((tc) => tc.status));
            const isOpen = expandedTicket === ticket.id;
            return (
              <React.Fragment key={ticket.id}>
                <tr
                  onClick={() => setExpandedTicket(isOpen ? null : ticket.id)}
                  className="cursor-pointer"
                  style={{ background: i % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}
                >
                  <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: COLORS.text }}>{ticket.id}</td>
                  <td className="px-3 py-2 max-w-xs truncate" style={{ color: COLORS.text }}>{ticket.summary}</td>
                  <td className="px-3 py-2"><PriorityPill priority={ticket.priority} raw={ticket.priority_raw} /></td>
                  <td className="px-3 py-2"><StatusPill status={ticket.status} raw={ticket.status_raw} /></td>
                  <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{ticket.assignee}</td>
                  <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{ticket.created_by}</td>
                  <td className="px-3 py-2" style={{ color: COLORS.textMuted }}>{ticket.sprint}</td>
                  <td className="px-3 py-2" style={{ color: COLORS.text }}>{linkedTCs.length}</td>
                  <td className="px-3 py-2">{linkedTCs.length ? <StatusPill status={worst} /> : <span style={{ color: COLORS.textMuted }}>—</span>}</td>
                </tr>
                {isOpen && (
                  <tr style={{ background: COLORS.bg }}>
                    <td colSpan={10} className="p-3">
                      {linkedTCs.length === 0 ? (
                        <p className="text-xs px-2" style={{ color: COLORS.textMuted }}>No test cases linked to this ticket.</p>
                      ) : (
                        <Table columns={["TC ID", "Title", "Type", "Status"]}>
                          {linkedTCs.map((tc, j) => (
                            <tr key={tc.id} style={{ background: j % 2 ? COLORS.altRow : "transparent", borderTop: `1px solid ${COLORS.border}` }}>
                              <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.id}</td>
                              <td className="px-3 py-2" style={{ color: COLORS.text }}>{tc.title}</td>
                              <td className="px-3 py-2"><AutomationPill type={tc.type} /></td>
                              <td className="px-3 py-2"><StatusPill status={tc.status} raw={tc.status_raw} /></td>
                            </tr>
                          ))}
                        </Table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}

// =============================================================================
// PAGE 6 — Reports
// =============================================================================
function top5FailedTCs(testCases) {
  return [...testCases]
    .filter((t) => t.status === "Failed")
    .sort((a, b) => (b.execution_date || "").localeCompare(a.execution_date || ""))
    .slice(0, 5);
}

function top5OpenCriticalBugs(tickets) {
  return tickets
    .filter((t) => t.type === "Bug" && t.priority === "Critical" && (t.status === "Open" || t.status === "In Progress"))
    .slice(0, 5);
}

function suiteDeltaList(currentTCs, prevTCs) {
  const curHealth = suiteHealth(currentTCs);
  const prevHealth = suiteHealth(prevTCs);
  const suites = [...new Set([...curHealth.map((s) => s.suite), ...prevHealth.map((s) => s.suite)])].sort();
  return suites.map((suite) => {
    const c = curHealth.find((s) => s.suite === suite);
    const p = prevHealth.find((s) => s.suite === suite);
    return { suite, delta: (c?.passPct ?? 0) - (p?.passPct ?? 0), current: c?.passPct ?? 0 };
  });
}

function MiniListCard({ title, children }) {
  return (
    <div className="rounded-lg p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>{title}</h3>
      {children}
    </div>
  );
}

function ReportsPage() {
  const { tickets, testCases, sprintWindows, currentSprint, previousSprint } = useData();
  const { filters } = useFilters();
  const { showToast } = useToast();
  const hasComparison = previousSprint != null;

  const filtered = useMemo(() => applyFilters(tickets, testCases, filters, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const currentSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, currentSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint]);
  const prevSprintData = useMemo(() => filterForSprint(tickets, testCases, filters, previousSprint, sprintWindows, currentSprint), [tickets, testCases, filters, sprintWindows, currentSprint, previousSprint]);

  const summary = useMemo(() => {
    const curBugs = currentSprintData.tickets.filter((t) => t.type === "Bug");
    const bugsOpened = curBugs.length;
    const bugsClosed = curBugs.filter((t) => t.status === "Closed" || t.status === "Resolved").length;
    return {
      passRatePct: passRate(currentSprintData.testCases) ?? 0,
      coveragePct: automationCoverage(currentSprintData.testCases),
      bugsOpened,
      bugsClosed,
      netDelta: bugsClosed - bugsOpened,
    };
  }, [currentSprintData]);

  const failedTCs = useMemo(() => top5FailedTCs(filtered.testCases), [filtered]);
  const criticalBugs = useMemo(() => top5OpenCriticalBugs(filtered.tickets), [filtered]);
  const suiteDeltas = useMemo(
    () => (hasComparison ? suiteDeltaList(currentSprintData.testCases, prevSprintData.testCases) : []),
    [currentSprintData, prevSprintData, hasComparison]
  );
  const mostImproved = useMemo(() => [...suiteDeltas].sort((a, b) => b.delta - a.delta), [suiteDeltas]);
  const mostRegressed = useMemo(() => [...suiteDeltas].sort((a, b) => a.delta - b.delta), [suiteDeltas]);

  const triggerExport = (label) => showToast(`${label} triggered — connect backend to enable.`);

  return (
    <div>
      <Section title={`Sprint Summary — ${currentSprint || "All Data"}`}>
        <div className="rounded-lg p-5 grid grid-cols-4 gap-6" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <div>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Pass Rate</span>
            <div className="text-2xl font-bold mt-1" style={{ color: COLORS.text }}>{Math.round(summary.passRatePct)}%</div>
          </div>
          <div>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Automation Coverage</span>
            <div className="text-2xl font-bold mt-1" style={{ color: COLORS.text }}>{Math.round(summary.coveragePct)}%</div>
          </div>
          <div>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Bugs Opened vs Closed</span>
            <div className="text-2xl font-bold mt-1" style={{ color: COLORS.text }}>
              {summary.bugsOpened} <span style={{ color: COLORS.textMuted, fontSize: 14 }}>vs</span> {summary.bugsClosed}
            </div>
          </div>
          <div>
            <span className="text-xs" style={{ color: COLORS.textMuted }}>Net Delta (Closed − Opened)</span>
            <div className="mt-1"><Delta value={summary.netDelta} goodDirection="up" suffix="" /></div>
          </div>
        </div>
      </Section>

      <Section title="Highlights">
        <div className="grid grid-cols-2 gap-4">
          <MiniListCard title="Top 5 Failed TCs">
            {failedTCs.length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.textMuted }}>No failed test cases.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {failedTCs.map((tc) => (
                  <div key={tc.id} className="flex items-center justify-between text-xs">
                    <span style={{ color: COLORS.text }} className="truncate">{tc.id} · {tc.title}</span>
                    <span style={{ color: COLORS.textMuted }}>{formatDate(tc.execution_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </MiniListCard>

          <MiniListCard title="Top 5 Open Critical Bugs">
            {criticalBugs.length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.textMuted }}>No open critical bugs.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {criticalBugs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                    <span style={{ color: COLORS.text }} className="truncate">{t.id} · {t.summary}</span>
                    <StatusPill status={t.status} raw={t.status_raw} />
                  </div>
                ))}
              </div>
            )}
          </MiniListCard>

          <MiniListCard title={hasComparison ? `Suites Most Improved (${previousSprint} → ${currentSprint})` : "Suites Most Improved"}>
            <div className="flex flex-col gap-2">
              {!hasComparison ? (
                <p className="text-xs" style={{ color: COLORS.textMuted }}>Not enough sprint history yet to compare.</p>
              ) : (
                mostImproved.map((s) => (
                  <div key={s.suite} className="flex items-center justify-between text-xs">
                    <span style={{ color: COLORS.text }}>{s.suite}</span>
                    <Delta value={s.delta} goodDirection="up" />
                  </div>
                ))
              )}
            </div>
          </MiniListCard>

          <MiniListCard title={hasComparison ? `Suites Most Regressed (${previousSprint} → ${currentSprint})` : "Suites Most Regressed"}>
            <div className="flex flex-col gap-2">
              {!hasComparison && <p className="text-xs" style={{ color: COLORS.textMuted }}>Not enough sprint history yet to compare.</p>}
              {hasComparison && mostRegressed.map((s) => (
                <div key={s.suite} className="flex items-center justify-between text-xs">
                  <span style={{ color: COLORS.text }}>{s.suite}</span>
                  <Delta value={s.delta} goodDirection="up" />
                </div>
              ))}
            </div>
          </MiniListCard>
        </div>
      </Section>

      <Section title="Export">
        <div className="flex gap-3">
          <button
            onClick={() => triggerExport("Export PDF")}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium"
            style={{ background: COLORS.altRow, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <FileText size={14} /> Export PDF
          </button>
          <button
            onClick={() => triggerExport("Export CSV")}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium"
            style={{ background: COLORS.altRow, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => triggerExport("Share Link")}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium"
            style={{ background: COLORS.altRow, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <Share2 size={14} /> Share Link
          </button>
        </div>
      </Section>
    </div>
  );
}

// =============================================================================
// Shell + App root
// =============================================================================
function PageRouter({ page }) {
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "execution":
      return <TestExecutionPage />;
    case "automation":
      return <AutomationPage />;
    case "traceability":
      return <TraceabilityPage />;
    case "testers":
      return <TestersPage />;
    case "defects":
      return <DefectsPage />;
    case "reports":
      return <ReportsPage />;
    default:
      return <OverviewPage />;
  }
}

function SourceErrorBanner({ sourceErrors, defectSource, tcSource }) {
  const issues = [
    sourceErrors.tickets && { label: defectSource, message: sourceErrors.tickets },
    sourceErrors.testCases && { label: tcSource, message: sourceErrors.testCases },
  ].filter(Boolean);
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 px-5 py-2 text-xs shrink-0" style={{ background: `${COLORS.warning}14`, borderBottom: `1px solid ${COLORS.warning}55`, color: COLORS.warning }}>
      {issues.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <AlertTriangle size={12} />
          <span className="font-medium">{i.label}</span>
          <span style={{ color: COLORS.textMuted }}>{i.message}</span>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const [page, setPage] = useState("overview");
  const { loading, error, sourceErrors, defectSource, tcSource } = useData();

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
      <Sidebar page={page} setPage={setPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        {!loading && !error && <SourceErrorBanner sourceErrors={sourceErrors} defectSource={defectSource} tcSource={tcSource} />}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? <LoadingState /> : error ? <ErrorState error={error} /> : <PageRouter page={page} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <FilterProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </FilterProvider>
    </DataProvider>
  );
}
