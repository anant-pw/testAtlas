# Spec: Last-Updated Timestamp in Dashboard Header

## Objective

QA engineers reading the TestAtlas dashboard need to know how fresh the
displayed data is. When the data was last refreshed should be visible at a
glance without leaving the page or hovering over anything.

**User story:** As a QA engineer using the live-API mode, I want to see when
the dashboard data was last fetched so I can judge whether the metrics
reflect the current state of my project.

**Success criteria** (all must be true for the feature to be "done"):
- A "Updated HH:MM AM/PM" label appears in the header after the first
  successful data load.
- The timestamp updates every time data is re-fetched (manual reload,
  Mock ↔ Live toggle, or source change).
- No timestamp is shown while data is loading or in a full-page error state.
- If the fetch completed on a different calendar day than today, the label
  shows "Updated D MMM, HH:MM AM/PM" (e.g. "Updated 25 Jun, 11:47 PM").
- The label is positioned to the right of the filter controls and to the
  left of the Mock/Live badge.
- A saved vitest test asserts that after a stubbed load the timestamp
  element is present in the DOM with the expected text prefix "Updated".

## Tech Stack

React 18, Vitest (jsdom), single-file component `TestManagementDashboard.jsx`.
No new dependencies required.

## Commands

```
Dev:   npm run dev
Test:  npm test
Build: npm run build
```

## Project Structure

```
TestManagementDashboard.jsx  → single-file component — all changes here
tests/app.smoke.test.jsx     → existing smoke suite — extend with new test
tests/setup.js               → ResizeObserver stub — do not modify
specs/                       → this spec file lives here
```

## Code Style

Follow the existing patterns in `TestManagementDashboard.jsx`:

```jsx
// State in DataProvider alongside existing loading/error state
const [lastUpdated, setLastUpdated] = useState(null);

// Set at the point where setLoading(false) is called after a successful load
setLastUpdated(new Date());

// Exposed through DataContext value object
const value = useMemo(
  () => ({
    ..., lastUpdated,
  }),
  [..., lastUpdated]
);

// Rendered in Header — compact, muted text
{lastUpdated && (
  <span className="text-xs" style={{ color: COLORS.textMuted }}>
    Updated {formatTimestamp(lastUpdated)}
  </span>
)}
```

`formatTimestamp(date)` is a pure function (plain JS, no library):
- Same calendar day: `"2:34 PM"` (via `toLocaleTimeString` with `hour`/`minute`/`hour12` options)
- Different calendar day: `"25 Jun, 11:47 PM"` (prepend `day + abbreviated month`)
- "Same day" comparison uses the local date string of `date` vs `new Date()` at render time

## Testing Strategy

Framework: Vitest + jsdom (existing setup).
Test location: `tests/app.smoke.test.jsx` — extend the existing `describe` block.
No new test file needed.

New test:
```js
it("shows a last-updated timestamp in the header after data loads", async () => {
  const label = [...container.querySelectorAll("span")]
    .find((s) => s.textContent.trim().startsWith("Updated"));
  expect(label).toBeTruthy();
  expect(label.textContent.trim()).toMatch(/^Updated \d{1,2}:\d{2} (AM|PM)$/);
});
```

The `stubFetch` helper in `beforeEach` already resolves fetch calls, so
`lastUpdated` will be set by the time the existing 50 ms `act` settles.

## Boundaries

**Always:**
- Run `npm test` after implementing and confirm all existing tests still pass
- Keep `lastUpdated` state inside `DataProvider` (not a separate context)
- Use only the existing `COLORS.textMuted` colour token — do not add new
  colour values

**Ask first:**
- Any change to the header's flex layout that could affect the filter or
  Mock/Live badge positioning
- Adding an external date-formatting library (not needed here; use native
  `Intl`/`toLocaleTimeString`)

**Never:**
- Hardcode locale strings — use the browser's locale via `toLocaleTimeString`
- Add a polling mechanism or auto-refresh timer (not requested)
- Modify `tests/setup.js`

## Implementation Plan

### Task 1 — Add `lastUpdated` state to `DataProvider`
- Add `const [lastUpdated, setLastUpdated] = useState(null);` alongside
  existing state (line ~518).
- Call `setLastUpdated(new Date())` immediately before or after
  `setLoading(false)` (line ~548).
- Add `lastUpdated` to the `value` useMemo object and its deps array
  (lines ~579–590).
- Acceptance: `useData().lastUpdated` is a `Date` instance after load.
- Verify: unit test in Task 3.
- Files: `TestManagementDashboard.jsx`

### Task 2 — Add `formatTimestamp` helper and render in `Header`
- Add `formatTimestamp(date)` as a module-level pure function before
  the component definitions.
- In `Header`, destructure `lastUpdated` from `useData()`.
- Render the timestamp `<span>` between the filter `<div>` and the
  Mock/Live `<button>` (lines ~1359–1361).
- Acceptance: timestamp appears in DOM after load; correct format for
  same-day and cross-day cases.
- Verify: vitest test in Task 3; manual check in browser (`npm run dev`).
- Files: `TestManagementDashboard.jsx`

### Task 3 — Write and save the vitest test
- Extend `tests/app.smoke.test.jsx` with the test shown in Testing Strategy.
- Run `npm test` — all five tests (4 existing + 1 new) must pass.
- Acceptance: test output shows 5 passed, 0 failed.
- Verify: `npm test` output.
- Files: `tests/app.smoke.test.jsx`

## Open Questions

None after assumptions above were confirmed.
