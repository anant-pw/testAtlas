import express from "express";

// Every one of the 12 source route files (Jira, Bugzilla, TestLink, ...)
// was the same 16-line skeleton: check isConfigured(), call the adapter,
// map a thrown error to a 502. This factory is that skeleton, parameterised
// by src/sources.js — same status codes, same error message strings, same
// response bodies as the original per-source files.
export function createSourceRouter({ resource, isConfigured, fetchData, missingConfigMessage }) {
  const router = express.Router();
  router.get(`/${resource}`, async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ error: missingConfigMessage });
    }
    try {
      res.json(await fetchData());
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
  return router;
}
