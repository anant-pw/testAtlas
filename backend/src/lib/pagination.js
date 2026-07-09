import { fetchJson } from "./http.js";

// Generic replacement for the near-identical `paginate()` loop that used to
// be copy-pasted in 4 adapters (TestRail, qTest, Zephyr Scale, PractiTest)
// plus two more bespoke inline loops (Bugzilla, GitHub Issues) — same
// while-loop skeleton (fetch page -> extract batch -> push -> decide
// whether to keep going), differing only in how the page is addressed in
// the URL and how the batch is pulled out of the response body. Each
// adapter supplies those two differences as small functions; the request
// sequence and URLs they produce are unchanged from before this refactor.
export async function paginate({ buildPageUrl, headers, extractBatch, isLastPage, pageSize, sourceName }) {
  const items = [];
  let page = 0;
  while (true) {
    const data = await fetchJson(buildPageUrl(page), { headers, sourceName });
    const batch = extractBatch(data);
    items.push(...batch);
    const lastPage = isLastPage ? isLastPage(data, batch) : pageSize != null && batch.length < pageSize;
    if (lastPage) break;
    page += 1;
  }
  return items;
}
