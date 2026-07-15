import express from "express";
import cors from "cors";
import { config } from "./src/config.js";
import { TICKET_SOURCES, TEST_CASE_SOURCES } from "./src/sources.js";
import { createSourceRouter } from "./src/routes/createSourceRouter.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Defense-in-depth shared-secret check (see config.js for why this isn't a
// real trust boundary on its own). Disabled entirely when unset.
function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();
  if (req.headers["x-api-key"] === config.apiKey) return next();
  res.status(401).json({ error: "Missing or invalid API key" });
}

// Only the one source matching CONFIG.DEFECT_SOURCE/TC_SOURCE in the
// dashboard actually gets called, but all are mounted so switching sources
// is just a config change, not a deploy. See src/sources.js for the list.
for (const source of [...TICKET_SOURCES, ...TEST_CASE_SOURCES]) {
  app.use(`/api/${source.key}`, requireApiKey, createSourceRouter(source));
}

app.listen(config.port, () => {
  console.log(`Test Management Dashboard backend listening on http://localhost:${config.port}`);
  console.log("Defect sources:    /api/jira | /api/azure_devops | /api/bugzilla | /api/mantis | /api/github_issues | /api/linear");
  console.log("TC sources: /api/testlink | /api/testrail | /api/qtest | /api/zephyr_scale | /api/practitest | /api/kiwi_tcms | /api/azure_devops_testplans");
});
