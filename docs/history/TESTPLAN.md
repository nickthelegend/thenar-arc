# Thenar — test plan

Every page, every API route, every on-chain interaction, every external
integration, and the realistic edge cases through them. Each item states what
*correct* means as a specific expected result, not "should work".

Target: **https://thenar.io** (Vercel frontend, Railway API + SQLite volume),
Avalanche Fuji chain 43113, AxonProtocol `0x025dB4A5…F3b3`.

Console and network are checked on **every** UI item. Any error anywhere fails
the item.

---

## A. Pages (14)

| # | Item | Correct means |
|---|---|---|
| A1 | `/` landing | Hero renders the real headline (not the error boundary). Rail shows 4 ticks. Scrolling advances the active sheet; the rail tick and the visible sheet agree at every position; exactly 3 of 4 sheets are `inert`. Console silent. |
| A2 | `/hub` | Lists the 8 on-chain tasks. Shows the seeded-funding disclosure naming the real count. Scenario and Skill filter rows present; selecting a skill narrows the list to exactly the tasks with that skill. Console silent. |
| A3 | `/space` | Lists rooms; header counts match `/api/space`. A task with operators in it is listed even when full. Console silent. |
| A4 | `/inventory` | 43 tiles (34 props + 7 rooms + 2 uploaded). Exactly **1** WebGL canvas. Filters narrow correctly. Console silent. |
| A5 | `/post` | 48 pickable tiles, 1 canvas. Room selection changes the scenario index. Payload/landmark selection recomposes the instruction with the right preposition. Console silent. |
| A6 | `/leaderboard` | Standings from chain; totals equal the sum of rows. Links to the archive. Console silent. |
| A7 | `/portfolio` (disconnected) | Shows the connect prompt, not an empty table. Console silent. |
| A8 | `/foundry` | Policy market reads chain; policy 0 shows licenceFee 0.02 and 1 licence sold. Console silent. |
| A9 | `/spec` | Arm spec table. "What this is not" lists all 4 non-capabilities. Links to `/passkey`. Console silent. |
| A10 | `/archive` | 13 Monad-era runs, each linking MonadScan. Explains why they are separate. Console silent. |
| A11 | `/passkey` (disconnected) | Explains the curve and the precompile, links the registry on Snowtrace, prompts to connect. Console silent. |
| A12 | `/task/4` | Skill chip ROTATE, room "Play table", stage track, seed-funding note, runs list. Console silent. |
| A13 | `/station/4` | Loads exactly 4 GLBs: arm, dice, crate, `play.glb`. Skill and Room rows present. Legend names arrow keys. Console silent. |
| A14 | `/run/<hash>` | Resolves a real trajectory, re-hashes the samples and reports integrity match, links the tx on the chain the row records. Console silent. |

## B. API routes (16)

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /api/health` | 200, `ok:true`, all 7 checks true, `ledgerMatchesChain` reconciles stored vs `trajectoryCount()`. |
| B2 | `GET /api/feed` | 200, `total` equals `trajectoryCount()` (12). Every `tx_hash` resolves on Fuji. |
| B3 | `GET /api/archive` | 200, 13 runs, all on chain 10143, none resolving on Fuji. |
| B4 | `GET /api/contract` | 200, returns the ABI and address. |
| B5 | `GET /api/dataset?taskId=7` | 200, episodes equal that task's settled Fuji runs; observation channels and action arrays populated, not null. |
| B6 | `GET /api/dataset` (no id) | 400 with a specific message, not 500 and not task 0. |
| B7 | `GET /api/dataset?taskId=-1` | 400 with a specific message. |
| B8 | `GET /api/glacier/<addr>` | 200, settlements decoded from the ABI; reverted calls shown as reverted. |
| B9 | `GET /api/glacier/notanaddress` | 400, not 500. |
| B10 | `GET /api/trajectory/<hash>` | 200 with integrity block; unknown hash → 404. |
| B11 | `GET /api/task/4/runs` | 200, only settled runs on the active chain. |
| B12 | `GET /api/props` | 200, lists uploaded props. |
| B13 | `POST /api/props` (bad file) | Rejects non-glTF with a specific error, not 500. |
| B14 | `GET|POST|DELETE /api/space/<id>` | Pose upsert returns the other operators; DELETE removes immediately; stale poses pruned after 4 s; malformed pose → 400 with its own message. |
| B15 | `GET /api/space` | 200, occupancy matches what was posted. |
| B16 | `GET /api/reconcile` | 200, idempotent — a second run resolves 0 and changes nothing. |
| B17 | `GET /api/snapshot` | 200, uploads a consistent copy, reports sha256 and row counts. |
| B18 | `POST /api/verify` (malformed) | 400 with a specific error, not 500. |
| B19 | `POST /api/submitted` (malformed) | 400 with a specific error, not 500. |

## C. On-chain interactions (10)

| # | Item | Correct means |
|---|---|---|
| C1 | 6 contracts deployed | All six addresses return non-empty bytecode on Fuji. |
| C2 | `taskCount` / `trajectoryCount` / `policyCount` | 8 / 12 / 1. |
| C3 | `submitTrajectory` | 12 real transactions at the contract, selector `0x15e9c468`. |
| C4 | `createTask` | 8 real transactions, selector `0xdb2399d0`. |
| C5 | `mintPolicy` | 2 transactions; policy 0 exists with a cap table. |
| C6 | `licensePolicy` | 1 transaction; policy 0 shows `licencesSold=1`, `distributed=0.0195 AVAX`. |
| C7 | Reverts by selector | `AlreadySubmitted`, `BadSignature`, `CapReached`, `NotFilled`, `WrongFee` all present in the ABI and reachable. |
| C8 | `RUNS_PER_ACCOUNT` | Returns 5. |
| C9 | P-256 precompile `0x0100` | Real WebCrypto signature → 1; tampered digest → empty. |
| C10 | `PasskeyRegistry.verifyWithKey` | Real signature → true; tampered r → false. |

## D. External integrations (3)

| # | Item | Correct means |
|---|---|---|
| D1 | Glacier (Avalanche Data API) | Returns real transactions for the contract with no API key. |
| D2 | Object storage snapshot | Object retrievable, sha256 matches, restores with `integrity_check ok`. |
| D3 | WalletConnect | Modal offers WalletConnect-backed wallets. **Blocked: no projectId exists.** |

## E. Edge cases (10)

| # | Item | Correct means |
|---|---|---|
| E1 | `/post` negative slots | Specific error, escrow reads 0.0000, submit disabled. |
| E2 | `/post` zero slots | Specific error. |
| E3 | `/post` negative reward | Specific error. |
| E4 | `/post` letters in a number field | Specific error. |
| E5 | `/task/9999` | "not in the registry", not a crash. |
| E6 | `/station/9999` | Handled, not a crash. |
| E7 | `/run/0xdeadbeef` | Not-found state, not a crash. |
| E8 | `/api/space/abc` | 400. |
| E9 | Disconnected wallet across all pages | Every page usable; no page requires a wallet to read. |
| E10 | Archive tx isolation | No archive tx resolves on Fuji; no feed tx resolves only on Monad. |

## F. Quality gates (4)

| # | Item | Correct means |
|---|---|---|
| F1 | No mocks/stubs | 0 hits for mock/stub/fake/dummy/TODO/FIXME across `app`, `components`, `lib`, `contracts/src`. |
| F2 | ESLint | 0 problems. |
| F3 | Design detector | 0 findings, exit 0. |
| F4 | Console | 0 errors on every page in section A. |

**Total: 60 items.**

---

# Results — 30 Aug 2026, against https://thenar.io

Executed in real Chrome against the deployed product. Console checked on every
UI item. Two rounds: first pass, fixes, then the whole plan again top to bottom.

**59 PASS · 0 FAIL · 1 UNTESTABLE (60 items).**

## Failures found and fixed

| Item | What was wrong | Fix |
|---|---|---|
| **B10 / A14** | `/api/trajectory/[hash]` never sent `chainId`, though `/run/[hash]` types it, links with `txUrlOn(chainId)` and renders a "settled on" note. An archived Monad run therefore rendered a **Snowtrace link for a transaction Fuji has never heard of** — the feed's original bug, on the page whose entire job is letting someone check a payout. An earlier edit had reported success and not applied. | Field added. Verified: Fuji run → `43113`, 2 Snowtrace links, no note; Monad run → `10143`, 1 MonadScan link, 0 Snowtrace, "Settled on Monad Testnet" and an archive link. |
| **E6** | `/station/9999` sat on "Reading task #9999 from the chain…" indefinitely. The catalogue had answered — eight tasks, none of them 9999 — so nothing was being read, and the page said otherwise for as long as it was open. | Waits only while the catalogue is genuinely in flight; otherwise renders "Task 9999 is not in the registry." Valid stations unaffected — `/station/4` still loads its four assets. |

## Corrections to the plan itself, not the app

- **B13** expected 400 for a non-glTF upload. The app returns **415 Unsupported
  Media Type** with `{"error":"too short to be a GLB"}`, which is the more
  correct status. The plan was wrong, not the code.
- **A4** read 41 tiles on the first attempt, during a Railway restart:
  `/api/props` failed transiently and the page **degraded to the built-in
  library instead of erroring**. On retry, 43 tiles / 24 payloads. Intended
  behaviour.
- **A9** and several others initially looked like failures because the design
  system uppercases those strings via CSS and my regexes were case-sensitive.
  All four non-capabilities do render.

## Untestable

- **D3 WalletConnect** — no `projectId` exists in local env, Vercel or Railway,
  and obtaining one requires creating a Reown account. Not marked PASS.

## Standing confirmation

Zero mocks, zero stubs, zero TODO/FIXME across `app`, `components`, `lib`,
`contracts/src`. ESLint 0 problems. Design detector 0 findings. **Zero console
errors on all 14 pages**, re-checked after every fix.
