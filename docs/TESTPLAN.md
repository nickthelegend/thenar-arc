# Thenar — full test plan

Target: **https://thenar.io** (the deployed product: real Postgres, real
AxonProtocol at `0x909d93…` on Avalanche Fuji, real Glacier/Snowtrace calls).
Local dev is used only to reproduce a failure, never to declare a pass.

Definition of PASS, applied to every item without exception:
1. The observable result matches the stated expectation exactly.
2. Zero console errors on the page during the interaction.
3. Zero failed network requests (any 4xx/5xx that the product itself issued).
An item that renders correctly but logs an error is a FAIL.

Legend: `[ ]` untested · `[P]` pass · `[F]` fail · `[U]` untestable (stated reason)

---

## A. Pages — render, data, console, network

| # | Item | Correct means |
|---|---|---|
| A1 | `/` landing | Hero word + subject weave paints; 7 sections present; `traceRatio` = 3.333; elevation to scale; 0 console errors |
| A2 | `/hub` | Task table lists every open task read from chain; TASKS/UNFILLED SLOTS/ESCROW figures non-placeholder and equal to on-chain values; filters render |
| A3 | `/hub` filter — scenario | Selecting `Workshop` narrows rows to workshop tasks only; count consistent with badge |
| A4 | `/hub` filter — skill | Selecting `Insert` narrows to insert tasks only |
| A5 | `/hub` view — Every Task | Shows tasks with 0 slots left in addition to accepting ones |
| A6 | `/hub` search | Typing a task id shows only that task; typing nonsense shows a non-empty empty-state, not a blank page |
| A7 | `/space` | Ruled room list, one row per open task, occupancy marker present |
| A8 | `/station/1` | 3D viewport initialises (canvas sized > 300×150, WebGL context alive); task brief, controls, scoring panel all populated from chain |
| A9 | `/station/1` practice | "Practise first" starts a run with no wallet and no slot consumed |
| A10 | `/spec` | Every figure read from `lib/arm-spec.json`; 21 parts, 8080 triangles, reach 512 mm, closed-surface count 21/21 |
| A11 | `/leaderboard` | Operator rows with real addresses + real earned totals from chain |
| A12 | `/portfolio` (no wallet) | Explicit disconnected empty state, not a crash or an infinite spinner |
| A13 | `/inventory` | Prop grid renders with real previews; dimensions shown per prop |
| A14 | `/corpus` | Corpus figures render from the dataset API |
| A15 | `/policies` | Policy list or an explicit empty state; no 500 |
| A16 | `/foundry` | Foundry surface renders; no 404 on its data |
| A17 | `/post` | Task-posting form renders with scenario/skill/difficulty controls |
| A18 | `/changelog` | Entries render from `lib/changelog.json` |
| A19 | `/status` | Health figures render; no 503 from its own endpoint |
| A20 | `/archive` | Archive list or explicit empty state |
| A21 | `/passkey` | Registry UI renders; WebCrypto available |
| A22 | `/task/1` | Task detail: brief, par, escrow, attempts, all from chain |
| A23 | `/operator/<addr>` | Operator profile for a real address that has runs |
| A24 | `/run/<hash>` | Run detail for a real recorded trajectory hash |
| A25 | `/licence/<id>` | Licence page for a real policy id, or explicit empty state |
| A26 | `/handheld` | Renders (mobile-oriented surface) |
| A27 | `/offline` | Offline fallback renders standalone |
| A28 | 404 route | An unknown path returns the app's not-found, not a stack trace |

## B. API endpoints — status, shape, no stubs

Each: 200 (or a deliberate documented non-200), `content-type: application/json`
where JSON is intended, body shape matches its consumer, and **no fabricated
data** — figures must trace to chain, DB, or a generated artifact.

| # | Endpoint | Correct means |
|---|---|---|
| B1 | `/api/health` | 200, reports db + chain reachability truthfully |
| B2 | `/api/contract` | 200, returns the real deployed ABI + address |
| B3 | `/api/stats` | 200, counts equal on-chain counts |
| B4 | `/api/feed` | 200, recent paid runs, newest first |
| B5 | `/api/task/1/runs` | 200, runs recorded against task 1 |
| B6 | `/api/task/1/attempts` | 200 |
| B7 | `/api/task/1/history` | 200 |
| B8 | `/api/task/1/manifest` | 200 |
| B9 | `/api/task/1/datasheet` | 200, quotes the real score weights |
| B10 | `/api/task/1/notes` | 200 |
| B11 | `/api/task/1/paths` | 200 |
| B12 | `/api/task/1/team` | 200 |
| B13 | `/api/props` | 200, 34 props |
| B14 | `/api/props/<id>` | 200 for a real id; 404 for a bogus id |
| B15 | `/api/space` | 200, live occupancy |
| B16 | `/api/space/1` | 200 |
| B17 | `/api/corpus` | 200 |
| B18 | `/api/dataset` | 200 |
| B19 | `/api/dataset/summary` | 200 |
| B20 | `/api/archive` | 200 |
| B21 | `/api/openapi` | 200, valid OpenAPI document |
| B22 | `/api/policy` | 200 |
| B23 | `/api/snapshot` | 200 |
| B24 | `/api/snapshot/drill` | 200 |
| B25 | `/api/submitted` | 200 |
| B26 | `/api/verify` | Verifies a real signature; rejects a tampered one |
| B27 | `/api/sign` | Signs only a server-recomputed score; refuses a client-supplied one |
| B28 | `/api/trajectory/<hash>` | 200 for a real hash; 404 for a bogus one |
| B29 | `/api/trajectory/<hash>/similar` | 200 |
| B30 | `/api/trajectory/<hash>/annotation` | 200 |
| B31 | `/api/physics/<hash>` | 200 for a real hash |
| B32 | `/api/glacier/<address>` | 200, real Glacier API response |
| B33 | `/api/reconcile` | 200 |
| B34 | `/api/migrate` | Runs migrations idempotently |
| B35 | `/api/hit` | Records a hit |
| B36 | `/api/notify` | Handles a push subscription |
| B37 | `/api/openapi` shape | Paths listed match routes that exist |

## C. On-chain — real contract, real reads

| # | Item | Correct means |
|---|---|---|
| C1 | `taskCount()` | Matches the task count shown on `/hub` |
| C2 | `trajectoryCount()` | Matches the count shown on `/` and `/status` |
| C3 | `policyCount()` | Matches `/policies` |
| C4 | `getTask(1)` | Fields match `/task/1` exactly |
| C5 | Escrow total | Sum of per-task escrow equals the `/hub` "escrow at stake" figure |
| C6 | Write path — `submitTrajectory` | **Requires a funded wallet + signed tx.** Test only if a key with Fuji AVAX is present in env |
| C7 | PasskeyRegistry register/prove | Real WebCrypto signature verifies true; tampered verifies false |

## D. Edge cases

| # | Item | Correct means |
|---|---|---|
| D1 | `/task/99999` (nonexistent) | Explicit not-found, not a crash |
| D2 | `/operator/0xdead…` (no runs) | Empty state naming zero runs |
| D3 | `/run/0xbogus` | Explicit not-found |
| D4 | `/api/props/nope` | 404 JSON, not an HTML error page |
| D5 | `/hub` search with no match | Empty state with wording, not a blank table |
| D6 | Station with wallet disconnected | Practice works; submit is blocked with a stated reason |
| D7 | Offline behaviour | Service worker serves `/offline` |
| D8 | Dark theme, every page | No contrast regression, no unstyled surface |
| D9 | Mobile 390px, every page | No horizontal overflow |

## E. Cross-cutting

| # | Item | Correct means |
|---|---|---|
| E1 | No mocks/stubs in shipped code | No fixture/mock/placeholder data path reachable in production |
| E2 | Console clean, all pages | Zero errors across every page in A |
| E3 | Network clean, all pages | Zero self-inflicted 4xx/5xx across every page in A |


---

## Second pass — what was deepened

The first execution of this plan asserted several pages only as "renders more
than N characters", which is the vague should-work the plan itself forbids.
Those items were rewritten to name the heading the page must carry and, where
the page has a data source, a figure or row count that must agree with it —
`scripts/qa-deep.mjs`. The archive is the reason that matters: it renders two
groups, prior chains and superseded contracts, and a shallow check could not
tell whether the second was being dropped. It is now asserted at 33/33 rows
with both groups named.

Added in the second pass:

| # | Item | Correct means |
|---|---|---|
| B34 | `/api/migrate` unauthenticated | 401 `not authorised`. Not executed: a one-shot copy into the database that is already live |
| B35a | `/api/hit` with `DNT: 1` | `{counted:false, reason:"signalled"}` |
| B35b | `/api/hit` with `Sec-GPC: 1` | not counted |
| B36 | `/api/notify` invalid subscription | 4xx JSON naming the field |
| B37 | OpenAPI conformance | every advertised path answers; none 404s or 500s |
| C7 | PasskeyRegistry | a real P-256 signature verifies; a tampered one does not |
| D7 | Service worker | registered, `/offline` and `/sw.js` both 200 |

Latency, measured rather than asserted: the standings appeared after ~14s
because the activity scan issued forty sequential `getLogs` calls. Read in
parallel batches it is ~3.7s for the same eight operators.
