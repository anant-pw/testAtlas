// Captures screenshots against the real backend (Jira + TestLink).
// Patches CONFIG in TestManagementDashboard.jsx, lets Vite HMR update the
// already-running dev server on 5173, takes shots, then restores the file.
// Usage: npm run screenshot:live  (backend must be on :8001, dev server on :5173)
import { chromium } from "playwright";
import { setTimeout as sleep } from "timers/promises";
import http from "http";
import fs from "fs";

const DASHBOARD = "TestManagementDashboard.jsx";
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

const PAGES = [
  { label: "Overview",       file: "01-overview.png" },
  { label: "Test Execution", file: "02-test-execution.png" },
  { label: "Automation",     file: "03-automation.png" },
  { label: "Traceability",   file: "04-traceability.png" },
  { label: "Defects",        file: "05-defects.png" },
  { label: "Reports",        file: "06-reports.png" },
  { label: "Testers",        file: "07-testers.png" },
];

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => { res.destroy(); resolve(true); });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function patchConfig(src) {
  const original = fs.readFileSync(src, "utf8");
  const patched = original
    .replace(/USE_MOCK:\s*(true|false)/, "USE_MOCK: false")
    .replace(/DEFECT_SOURCE:\s*"[^"]+"/, 'DEFECT_SOURCE: "jira"')
    .replace(/TC_SOURCE:\s*"[^"]+"/, 'TC_SOURCE: "testlink"');
  if (patched === original) throw new Error("CONFIG patch produced no changes.");
  fs.writeFileSync(src, patched, "utf8");
  return () => fs.writeFileSync(src, original, "utf8");
}

if (!(await checkPort(PORT))) {
  console.error(`Dev server not found on port ${PORT}. Run 'npm run dev' first.`);
  process.exit(1);
}
if (!(await checkPort(8001))) {
  console.error("Backend not found on port 8001. Start the backend first.");
  process.exit(1);
}

console.log("Patching CONFIG (USE_MOCK=false, jira + testlink)…");
const restore = patchConfig(DASHBOARD);

let browser;
try {
  // Give Vite HMR time to pick up the file change and re-render
  console.log("Waiting for HMR…");
  await sleep(3000);

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("Loading dashboard with live data…");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for loading spinner to clear (live fetch takes longer than mock)
  await page.waitForFunction(
    () => !document.querySelector(".animate-spin"),
    { timeout: 20000 }
  );
  await sleep(1500);

  // Bail early with a clear message if the dashboard landed on an error state
  const errorHeading = await page.$("text=Couldn't load dashboard data");
  if (errorHeading) {
    throw new Error(
      "Dashboard shows an error state — check that both Jira and TestLink " +
      "backends are responding (test: curl http://localhost:8001/api/jira/tickets)"
    );
  }

  for (const { label, file } of PAGES) {
    const btn = page.getByRole("button", { name: label, exact: true });
    await btn.click();
    await sleep(1000);
    const dest = `screenshots/${file}`;
    await page.screenshot({ path: dest });
    console.log(`  ✓  ${dest}`);
  }

  console.log("\nAll screenshots saved to screenshots/");
} finally {
  await browser?.close();
  restore();
  console.log("CONFIG restored.");
}
