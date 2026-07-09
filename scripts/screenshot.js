// Captures fresh screenshots of every dashboard page in mock mode.
// Usage: npm run screenshot  (dev server must not already be running)
import { chromium } from "playwright";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import http from "http";

const PAGES = [
  { label: "Overview",       file: "01-overview.png" },
  { label: "Test Execution", file: "02-test-execution.png" },
  { label: "Automation",     file: "03-automation.png" },
  { label: "Traceability",   file: "04-traceability.png" },
  { label: "Defects",        file: "05-defects.png" },
  { label: "Reports",        file: "06-reports.png" },
  { label: "Testers",        file: "07-testers.png" },
];

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        setTimeout(attempt, 500);
      });
      req.setTimeout(500, () => req.destroy());
    }
    attempt();
  });
}

console.log("Starting dev server…");
const devServer = spawn("npx", ["vite", "--port", String(PORT)], {
  shell: true,
  stdio: "ignore",
  detached: false,
});

devServer.on("error", (err) => { console.error("Failed to start dev server:", err); process.exit(1); });

try {
  await waitForPort(PORT);
  console.log(`Dev server up at ${BASE_URL}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("Loading dashboard…");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Wait for mock data to render (charts need a tick to paint)
  await sleep(1200);

  for (const { label, file } of PAGES) {
    const btn = page.getByRole("button", { name: label, exact: true });
    await btn.click();
    await sleep(800);
    const dest = `screenshots/${file}`;
    await page.screenshot({ path: dest });
    console.log(`  ✓  ${dest}`);
  }

  await browser.close();
  console.log("\nAll screenshots saved to screenshots/");
} finally {
  devServer.kill();
}
