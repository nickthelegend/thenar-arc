# Thenar — test plan v2: the surface v1 did not reach

v1 (TESTPLAN.md, 60 items) covered every page, route, on-chain call and the
obvious edge cases. It did **not** cover interaction, the network tab per item,
responsive, accessibility, mid-flow interruption, empty states, or whether the
same task renders consistently across the surfaces that draw it.

This plan is those. Target: **https://thenar.io**, Avalanche Fuji 43113.

---

## G. Interaction flows (12)

| # | Item | Correct means |
|---|---|---|
| G1 | Nav traversal | Clicking each of the 6 nav links lands on that route, marks it `aria-current="page"`, and leaves no console error. |
| G2 | Skip link | Tab from page load focuses "Skip to content"; activating it moves focus into `<main>`. |
| G3 | Hub search by text | Typing "dice" narrows to the rotate task; clearing restores all 7. |
| G4 | Hub search by id | Typing "4" returns exactly task 4. |
| G5 | Hub search with no match | Typing "zzzz" yields an explicit empty state, not a blank table. |
| G6 | Hub sort | Each of the 4 sort keys reorders the rows; reward-sorted rows are non-increasing. |
| G7 | Hub "Every task" view | Switching from "Accepting runs" to "Every task" increases the row count to include full tasks. |
| G8 | Station help overlay | The `?` control opens a controls dialog listing every bound key; Escape or its close control dismisses it. |
| G9 | Station keyboard drives the arm | With the station focused, holding W changes the reported tool X; arrow-up does the same. Telemetry updates. |
| G10 | Prop upload, real GLB | Uploading a genuine glTF binary returns 200 with an id; the stored model is then served by `/api/props/<id>` as `model/gltf-binary` and byte-identical. |
| G11 | Prop upload, duplicate | Uploading the same bytes twice returns the same id rather than storing it twice. |
| G12 | Presence from the browser | Two browser contexts in one room see each other's roster entry. |

## H. Network tab (5)

| # | Item | Correct means |
|---|---|---|
| H1 | Landing | No request returns >= 400. |
| H2 | Hub | No request >= 400; the contract read succeeds. |
| H3 | Station | No request >= 400; exactly the 4 expected GLBs, each 200. |
| H4 | Inventory | No request >= 400; `/api/props` 200. |
| H5 | Post | No request >= 400. |

## I. Responsive (3)

| # | Item | Correct means |
|---|---|---|
| I1 | 375 px | No horizontal overflow (`scrollWidth <= clientWidth`) on landing, hub, station. |
| I2 | 768 px | Same, and the nav remains reachable. |
| I3 | 1440 px | Same. |

## J. Accessibility (4)

| # | Item | Correct means |
|---|---|---|
| J1 | Focus visibility | Every interactive element matches `:focus-visible` styling; no element has `outline: none` without a replacement. |
| J2 | Headings | Exactly one `<h1>` per page; no skipped heading levels. |
| J3 | Images and canvases | Every `<img>` has alt text; the 3D canvas is not the only path to the information. |
| J4 | Reduced motion | With `prefers-reduced-motion: reduce`, the hero renders all sheets stacked and nothing animates. |

## K. Mid-flow interruption (4)

| # | Item | Correct means |
|---|---|---|
| K1 | Navigate away mid-load | Leaving the station before the catalogue resolves throws no error and leaves no unhandled rejection. |
| K2 | Back/forward | Browser back from station → hub → back again restores each page's state without error. |
| K3 | Reload mid-scroll on the hero | Reloading part-way through the hero restores a coherent sheet, not a blank column. |
| K4 | Leaving a room | Navigating away from a station removes that operator from the room within the stale window. |

## L. Empty states (3)

| # | Item | Correct means |
|---|---|---|
| L1 | Task with no runs | `/task/4` (0 runs) shows an explicit "no runs yet" state, not an empty table or a zeroed chart. |
| L2 | Dataset for a task with no runs | `/api/dataset?taskId=4` returns 404 with a specific message, not an empty file. |
| L3 | Inventory filtered to empty | Filtering to a combination with no members shows "Nothing matches those filters." |

## M. API gaps v1 missed (5)

| # | Item | Correct means |
|---|---|---|
| M1 | `/api/props/<id>` | 200, `content-type: model/gltf-binary`, bytes identical to what was uploaded. |
| M2 | `/api/props/<unknown>` | 404, not 500. |
| M3 | `POST /api/reconcile` | Same result as GET; idempotent. |
| M4 | Oversized upload | A file over the cap is rejected with a specific error, not a 500 or a truncated store. |
| M5 | `/api/space` DELETE without `me` | Returns ok without removing anyone else. |

## N. Cross-surface consistency (2)

| # | Item | Correct means |
|---|---|---|
| N1 | One task, three surfaces | Task 4's skill, room and instruction are identical on `/hub`, `/task/4` and `/station/4` — the point of resolving the scene once. |
| N2 | Contract verification | All six contracts still report `exact_match` on Sourcify. |

**Total: 38 items.**

---

# Results — 30 Aug 2026, against https://thenar.io

**34 PASS · 0 FAIL · 4 UNTESTABLE (38 items).** v1's 60 items re-run after these
fixes: still green.

## Failures found and fixed

| Item | What was wrong | Fix |
|---|---|---|
| **J2** | The landing page had **four `<h1>` elements** — one per hero sheet. Three are inert and aria-hidden so only one reached assistive technology, but the document outline is read by more than a screen reader. | The showing sheet is the page's `h1`; the others are `h2` while they wait. Under reduced motion, where all four stack, the first leads. Verified: `h1Count: 1`. |
| **G8** | The station's controls overlay opened **only on the `?` key**, and the sidebar's "? All controls" was a key hint, not a control — so on the page most likely to be driven by a trackpad, the list of what the keys do was itself behind a key. It also had no dialog semantics, and carried an arrows row made redundant by an earlier legend change. | The hint is now a button (shortcut still works); the overlay is `role="dialog"` + `aria-modal` + labelled; the redundant row is gone. Verified: button opens it, 9 controls listed, Escape closes. |

## Untestable, with the reason

| Item | Why |
|---|---|
| **G9** keyboard drives the arm | The arm moves in an animation-frame loop. Chrome freezes frames in a background tab (`document.hidden: true`) and the request to foreground it was declined, so the tool position cannot change while under test. |
| **G12** presence between two contexts | A room entry requires a connected wallet — a spectator only reads. Server side is verified in v1 (B14): two operators see each other, DELETE removes immediately, stale poses prune after 4 s. |
| **K4** leaving a room | Same dependency: without a wallet there is no operator to remove. |
| **J4** reduced motion | No `prefers-reduced-motion` emulation is available in either browser tool. The CSS media block and `CountUp`'s `matchMedia` check are code-verified only. |

## One finding that is not an application defect

A `HEAD` to the current page URL returns **503** once per page load in the
extension's network log. It is **not the app**:

- The application issues no `HEAD` requests anywhere (`grep`, zero hits).
- Direct `HEAD` returns **200 on 12/12 attempts**, across plain, `RSC`,
  `Next-Router-Prefetch` and Chrome-UA variants, against both the Vercel edge
  and the Railway origin.
- It does **not appear in the page's own Resource Timing timeline**, which
  records only what the page requested. That timeline shows **zero failed
  resources** on `/`, `/hub`, `/inventory`, `/post` and `/station/4`.

Recorded rather than hidden, and not counted as a pass for the app it isn't in.

## Standing confirmation

Zero mocks, zero stubs, zero TODO/FIXME. ESLint 0. Design detector 0. Zero
console errors on every page. Six contracts still `exact_match` on Sourcify.
