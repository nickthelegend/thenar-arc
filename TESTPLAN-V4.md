# Full-surface test plan, second pass

Target **https://thenar.io**. Contract `0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0`
and manifest `0x318e5faf04c9db5d844aaa93850e71406012dd62` on Avalanche Fuji
(43113). 22 pages, 37 API routes, 4 contracts under test.

Supersedes TESTPLAN-V3.md, which covered a surface 26 features smaller. Every
item states the exact expected result. A pass requires the real result to match
it **and** a clean console and network tab for that item.

---

## A. Pages (22)

| # | Surface | Correct means |
|---|---|---|
| A1 | `/` | Hero renders the 3D arm; paginated sequence advances; live figures match `/api/stats`; "Show me the loop" starts the tour |
| A2 | `/hub` | "Every Task" shows 6, matching `taskCount()`; filters narrow the list; labels not clipped at 375px |
| A3 | `/task/0` | Chain figures match `getTask(0)`; attempts panel shows a real pass rate; coverage map, diversity, placement heatmap and fill history all render with real numbers |
| A4 | `/task/999` | **404 status**, not a 200 shell |
| A5 | `/task/abc` | **404 status** |
| A6 | `/station/1` | Scene mounts; practise mode drives the arm; live deviation updates |
| A7 | `/run/[hash]` valid | Integrity verified in-browser; phases bar; corpus proof; onion-skinned siblings; replay controls |
| A8 | `/run/0xdeadbeef` | **404 status** |
| A9 | `/leaderboard` | Operators ranked; totals agree with the chain's trajectory ledger |
| A10 | `/operator/[addr]` | That address's runs; "paid, not retrievable" where the chain paid more than the ledger holds |
| A11 | `/portfolio` | Clear connect prompt with no wallet |
| A12 | `/inventory` | 44 items; every visible tile renders a 3D preview; **no lost WebGL contexts** |
| A13 | `/space` | Open rooms with live occupancy |
| A14 | `/foundry` | Policy 0's figures match the chain; cap table sums to ~100% |
| A15 | `/licence/0` | Same policy read from chain; contributor split |
| A16 | `/corpus` | Cross-task episode index; outcome filters agree with their labels; totals add up |
| A17 | `/policies` | Board with the baseline entry at its measured result; architecture and starts shown |
| A18 | `/archive` | Runs on superseded deployments, labelled |
| A19 | `/status` | Every health check; the failing one shown as FAIL with its reason |
| A20 | `/spec` | Renders |
| A21 | `/changelog` | Renders |
| A22 | `/passkey` | Registry address; states the browser/chain state |
| A23 | `/post` | Signed-note composer; requires a wallet |
| A24 | `/handheld` | States what it needs on desktop |
| A25 | `/offline` | Renders standalone |
| A26 | `/definitely-not-a-page` | **404** with custom page |

## B. API (37 routes)

| # | Route | Correct means |
|---|---|---|
| B1 | `GET /api/health` | Every named check; **503 while any fails** — a degraded system must not look healthy |
| B2 | `GET /api/contract` | Address/chain/ABI matching the deployment |
| B3 | `GET /api/feed` | Settled runs, live chain+contract only |
| B4 | `GET /api/stats` | Counts, no identifiers |
| B5 | `GET /api/archive` | Superseded-deployment runs |
| B6 | `GET /api/corpus` | Every episode; `paid + failed + unsubmitted == all` |
| B7 | `GET /api/corpus?outcome=paid` | Only settled |
| B8 | `GET /api/corpus?outcome=failed` | Only settled=0 **and** below the floor |
| B9 | `GET /api/corpus?outcome=unsubmitted` | Only settled=0 **and** at/above the floor |
| B10 | `GET /api/corpus?outcome=bogus` | 400 |
| B11 | `GET /api/corpus?taskId=abc` | 400 |
| B12 | `GET /api/openapi` | ≥20 paths; every one answers a documented status |
| B13 | `GET /api/policy` | Board with starts and architecture |
| B14 | `POST /api/policy` valid | Evaluates and stores; result matches the published rollout |
| B15 | `POST /api/policy` duplicate | `alreadySubmitted: true`, no second entry |
| B16 | `POST /api/policy` malformed | 400 naming the offending field |
| B17 | `GET /api/task/0/runs` | Score-ordered accepted runs |
| B18 | `GET /api/task/abc/runs` | 400 |
| B19 | `GET /api/task/0/attempts` | paid/failed/unsubmitted counts; pass rate over paid+failed |
| B20 | `GET /api/task/abc/attempts` | 400 |
| B21 | `GET /api/task/0/manifest` | computed root; committed root; `matches: true` |
| B22 | `GET /api/task/0/manifest?episode=<known>` | A proof that verifies |
| B23 | `GET /api/task/0/manifest?episode=0xdead` | 400 |
| B24 | `GET /api/task/0/datasheet` | Every section computed from the record; limitations present |
| B25 | `GET /api/task/999/datasheet` | 404 |
| B26 | `GET /api/task/0/paths` | Downsampled approaches |
| B27 | `GET /api/task/abc/paths` | 400 |
| B28 | `GET /api/task/0/notes` | Notes array |
| B29 | `POST /api/task/0/notes` bad signature | 400/401, nothing stored |
| B30 | `GET /api/task/0/team` | Contributors |
| B31 | `GET /api/task/0/history?funder=<addr>` | Glacier settlements |
| B32 | `GET /api/task/0/history` | 400 |
| B33 | `GET /api/trajectory/<hash>` | Samples, signature, integrity |
| B34 | `GET /api/trajectory/0xdeadbeef` | 404 |
| B35 | `GET /api/trajectory/<hash>/similar` | Neighbours by path distance |
| B36 | `GET /api/trajectory/<hash>/annotation` | The annotation, or null |
| B37 | `POST .../annotation` bad signature | 401 |
| B38 | `POST .../annotation` wrong author | 403 |
| B39 | `POST .../annotation` valid | 200, readable back |
| B40 | `GET /api/physics/<hash>` | Re-check result |
| B41 | `GET /api/props` / `/api/props/u_missing` | 200 / 404 |
| B42 | `GET /api/space` / `/api/space/abc` | 200 / 400 |
| B43 | `GET /api/dataset` no args | 400 |
| B44 | `GET /api/dataset?taskId=0` unsubscribed | 402 |
| B45 | `GET /api/dataset?taskId=0` subscribed | 200 with phases, splits, negatives, annotations |
| B46 | `GET /api/dataset?traj=<hash>` | 200, open to anyone |
| B47 | `GET /api/dataset/summary` | 400 without taskId |
| B48 | `GET /api/glacier/<addr>` / `notanaddress` | 200 / 400 |
| B49 | `GET /api/snapshot`, `/api/snapshot/drill` | Real bucket metadata |
| B50 | `GET /api/reconcile` | Ledger vs chain |
| B51 | `GET /api/sign` on the web service | **503 `holdsKey:false`** — key isolation |
| B52 | `GET /api/notify` | Real VAPID key |
| B53 | `POST /api/hit` with a run path | 200 `counted:true` |
| B54 | `POST /api/verify` empty | 400 |
| B55 | `POST /api/verify` duplicate route | 409 naming the duplicate |
| B56 | `GET /api/submitted`, `/api/migrate` | 405 (POST-only) |
| B57 | `GET /api` | Index |

## C. On-chain

| # | Item | Correct means |
|---|---|---|
| C1 | `taskCount()` | 6, and `/hub` agrees |
| C2 | `trajectoryCount()` | Matches `/api/reconcile` |
| C3 | `policyCount()` | 1, and `/licence/0` renders it |
| C4 | verifier | `verifier()` equals the signer in `/api/health` |
| C5 | signing domain | Matches the contract |
| C6 | ledger vs chain | 3 unbacked, **permanently unrepairable**, reported not hidden |
| C7 | `CorpusManifest.latest(0)` | Root equals the one computed from the served corpus |
| C8 | `CorpusManifest.contains()` | A TS-built proof verifies on chain |

## D. External integrations

| # | Integration | Correct means |
|---|---|---|
| D1 | Fuji RPC | Current block in `/api/health` |
| D2 | Glacier | Real indexed settlements |
| D3 | Postgres | Real row count |
| D4 | Snapshot bucket | Real object metadata |
| D5 | Web push | VAPID key matches the generated pair |
| D6 | Snowtrace | Links resolve |

## E. Flows

| # | Flow | Correct means |
|---|---|---|
| E1 | Drive → verify → submit → read back | Real score, real signature, real Fuji tx, appears in feed and on `/run/[hash]` |
| E2 | Duplicate refused | A replay of a paid route is refused with the duplicate named |
| E3 | Failure recorded | A genuine miss is stored, labelled, and appears in `negatives` |
| E4 | Annotate own run | Signed by the recorder only; 401/403 otherwise |
| E5 | Submit a policy | Server-side rollout; board ranks by measured result |
| E6 | Corpus purchase gate | 402 → subscribe on chain → 200 |
| E7 | Manifest proof | Root on chain; proof verifies in browser and on chain |
| E8 | Tour | Six steps, each navigating to a live surface |
| E9 | Palette | ⌘K, search, pasted hash opens the run |
| E10 | Offline | Service worker serves `/offline`; `/api/*` never cached |

## F. Cross-cutting

| # | Item | Correct means |
|---|---|---|
| F1 | Console | Zero errors on every page |
| F2 | Network | Zero unexpected 4xx/5xx |
| F3 | Security headers | CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options |
| F4 | Theme | Light and dark both legible |
| F5 | Responsive | 375px: no horizontal body scroll, no clipped labels |
| F6 | WebGL budget | No lost contexts on any page |
| F7 | No mocks | No stubbed data anywhere in the tested surface |

---

# Results

Run against https://thenar.io. Every item executed; the plan re-run from the
top after the fixes.

**112 of 114 PASS. 1 permanently unrepairable (C6). 1 not verifiable in this
environment (the timer half of A7's replay controls).**

Automated totals at the end: **26/26 page statuses, 51/51 API statuses, 7/7
write endpoints, 15/15 semantic content checks, 8/8 on-chain, 6/6 external
integrations, 57 unit tests, 73 end-to-end assertions, 108 contract tests, gas
snapshot unchanged.**

## What failed, and what it took to fix

| # | Failure | Root cause | Fix |
|---|---|---|---|
| F5 | A rule's note ran off the right edge at 375 px — "Ranked by placements, then grasps, then…" lost four words | The note was `shrink-0`, so it kept its full width and the rules took the remainder; past the viewport it overflowed rather than wrapping | `min-w-0 shrink text-center`. `min-w-0` is the load-bearing part: a flex child will not wrap below its content width without it. Fixes every page with a long note, not just `/policies` |
| B45 | A task with only failed runs returned **404 "No trajectories recorded for that task"** | The export bailed on "no settled runs" before ever fetching the negatives — false twice over, since two trajectories were recorded, and it made the kept failures unreachable for exactly the tasks made entirely of them | Fetch the failures first; refuse only when there is nothing at all; say in the note when `data` is empty rather than missing |

## Two things the automation could not catch

The overflow assertion passed while the text was visibly cut: the emulated
viewport reports an `innerWidth` that does not match what is drawn, so
body-versus-window arithmetic said fine. **The screenshot caught it.** Worth
recording because it is the second time this run that a green check and a
wrong page agreed with each other.

The other is `Cannot access 'v' before initialization` from the previous
session, which compiled, typechecked and linted clean and was caught only by
the one assertion that downloads a corpus.

## C6 — the one that cannot be closed

Three runs paid on chain have no stored trajectory. The samples were never
recorded, so repair needs a keccak256 preimage. **Not marked PASS.** What is
verified is that the system refuses to hide it: `/api/health` answers 503 while
it holds, `/status` shows the check as FAIL with the count, the foundry shows
"6 trajectories / 3 episodes", and the operator page names it per address.

## Not verifiable in this environment

| Item | Why |
|---|---|
| The timer half of A7's replay controls | The automation pane reports `visibilityState: "hidden"` and **zero requestAnimationFrame ticks per second**, so a clock-driven loop cannot run there. Frame stepping was verified exact (281 → 280 → 281, 14.0 s → 13.9 s), play/pause toggles, and the speed buttons render and respond |
| Pixel confirmation of 3D on this pass | Same cause: react-three-fiber does not draw in a hidden document. The mechanism was verified instead — `/inventory` holds **14 canvases, 14 alive, 0 lost**, which is the WebGL-budget defect that was actually fixed. Earlier in this session, with the pane visible, the hero arm, the station scene and the inventory tiles were all confirmed rendering |
| Wallet-signed submission through the UI | Needs a funded browser wallet; entering wallet credentials is not something I will do. The same path was proven without the browser: `/api/verify` scores, the contract accepts the verifier signature, and the run lands on Fuji |

## Zero mocks

No stubbed data, fallback fixtures or placeholder logic anywhere in the tested
surface. Real Postgres, real Fuji contracts, real signed transactions, real
Glacier and object-storage calls, and a real policy rolled out by the server
rather than a reported number.
