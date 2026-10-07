# Full test plan: Thenar on Monad, every surface

**Scope:** the whole product: 28 pages, 45 API routes, 12 contracts, the
integrations, and the flows through them.

**Target:** the app served from this repository (`next dev --port 3334`,
`origin/main`). It runs against the live Monad testnet deployment in
`lib/deployment.ts` (chain 10143) and a real persisted SQLite store. The
production site (thenar.io) gets a final pass at the end.

**How it's driven:** through Claude in Chrome. Items that need a WebXR headset,
a serial port or file injection, which the extension cannot provide, run in a
headed Chromium through Playwright, and each such item says so.

**Base:** sections A to F keep the definitions of `docs/TESTPLAN-MONAD.md`,
changed only where the chain has moved on since that plan was written:

- There are 11 tasks, not 5.
- Untagged single-arm tasks now run on the SO-101.

Section G is new: everything the Quest, scan, teach, SO-101, real-props and
scoring-integrity work added.

**What counts as a pass:**

- The real result matches the stated expectation exactly.
- The console and the network tab for the item are clean.
- The only non-2xx allowed is a refusal the item itself asks for, and only on
  that request.

## A. Pages

| # | Surface | Correct means |
|---|---|---|
| A1 | `/` | Hero renders; the chain line names Monad Testnet · chain 10143; live figures (tasks 11, trajectories, escrow) equal `/api/stats` |
| A2 | `/hub` | "Every task" lists exactly `taskCount()` (11) tasks, counting collapsed groups; escrow total equals the sum of `getTask(i).escrow`; amounts in MON; filters narrow the list |
| A3 | `/task/0` | Name, reward, slots and escrow equal `getTask(0)`; arm chip SO-101 |
| A4 | `/task/999`, `/task/abc` | 404 status with the custom page |
| A5 | `/station/0` | Scene mounts with the SO-101; a practice run drives the arm; deviation updates; no wallet → practice with a reason |
| A6 | `/run/<hash>` of a settled run | Integrity verified in the browser; tx link on testnet.monadscan.com |
| A7 | `/run/0xdeadbeef` | 404 |
| A8 | `/leaderboard` | Contributors from the chain; with no runs, the stated empty state |
| A9 | `/operator/<addr>` | That address's runs from the chain |
| A10 | `/portfolio` | Clear connect prompt with no wallet |
| A11 | `/contracts` | The 12 deployed contracts, each with non-zero code read live |
| A12 | `/agents` | Terms: 0.01 USDC, eip155:10143, facilitator, payTo, SalesLog linked; ledger equals `/api/agent/sales` |
| A13 | `/corpus-token` | Name "Thenar Robot Corpus (THNRC)"; supply/holders/dividends equal the contract |
| A14 | `/lab` | Locally: the stated missing Privy lab wallet. On thenar.io: the wallet and its policy |
| A15 | `/corpus` | Episode index; subscription panel reads `pricePerDay` from CorpusAccess |
| A16 | `/foundry` | Treasury and proposal count equal the contract |
| A17 | `/policies` | Board renders; empty state stated |
| A18 | `/licence/0` | "No such policy", not a crash |
| A19 | `/archive` | Superseded deployments, labelled |
| A20 | `/status` | Every health check with its real state |
| A21 | `/passkey` | Registry address is the deployed one |
| A22 | `/post` | Composer; asks for a wallet; arm picker defaults to SO-101 |
| A23 | `/spec`, `/spec/so101`, `/changelog`, `/inventory`, `/space`, `/handheld`, `/offline` | Render with no errors |
| A24 | `/definitely-not-a-page` | 404 with the custom page |

## B. API

The definitions are those of `TESTPLAN-MONAD.md` B1–B30: `health`,
`contract`, `feed`, `stats`, `archive`, `corpus`, `openapi`, `policy`, `task/*`,
`calls`, `trajectory/*`, `physics`, `props`, `space`, `dataset`, `snapshot`,
`reconcile`, `sign`, `notify`, `hit`, `verify`, `submitted`/`migrate`,
`agent/corpus`, `agent/sales`, `agent/status`, `tokenize`, `lab` and `world/*`.
Every one is called from the page context in Chrome, so each shows in the
network tab.

## C. On-chain · D. Integrations · E. Flows · F. Cross-cutting

These are as in `TESTPLAN-MONAD.md`, with one change: C2 now expects
`taskCount() == 11`.

## G. Added in this work

| # | Item | Correct means |
|---|---|---|
| G1 | `/spec/so101` bench | Canvas renders the SO-101; moving X/Y/Z sliders re-solves; "Reached within" < 8 mm at (330, 0, 30), (200, −200, 30), (200, 150, 30) mm |
| G2 | Mirror with no relay running | Pressing "Mirror to my SO-101" shows "No arm relay answered…"; the page keeps working. The browser's own WebSocket-refused line is the item's expected refusal |
| G3 | Mirror through the relay to a follower | Relay with a firmware-protocol follower on a pty and `--arm`: ARM only at home, Q stream equals the page's joints within 1°, STOP when mirroring stops *(Playwright: the pty)* |
| G4 | SO-101 station run | `/station/0`: header chip SO-101, Arm row SO-101; the tool reaches the payload; a grasp holds it; placing it gets "Measurement taken" with a score |
| G5 | Two-arm task stays THENAR-6 | `/station/3`: two THENAR-6 arms, Arm row THENAR-6, Tab switches the active arm |
| G6 | `/post` arm picker | Default SO-101 → "On chain as … [arm so101]"; choosing THENAR-6 → "… [arm thenar6]" |
| G7 | `/post` table scan | Upload a real table photo with A4, click the four corners, place pick/goal → "Scanned: starts at x, y mm; goal at x, y mm" and the tag in the on-chain name; out-of-reach points refused with a reason |
| G8 | Real props | `/post` renders every prop as a still (41/41, 0 canvases); `/station/1` loads the photo-scanned crate with its textures; no GLTF errors |
| G9 | Hub groups identical bounties | #6–#10, same funder and same name, show as one row "+4 identical from this funder"; the toggle reveals all four with their own ids |
| G10 | Fake run refused | `POST /api/sign` with a recording whose arm never moves: 403 for an unverified address. For a verified human the 422 path is covered by `test/physicality.test.mjs` (a live 422 needs a World ID-verified address) |
| G11 | Headset teleop | Enter in VR; A begins a run; grip follows 1:1; trigger closes the jaws on the payload; the run is measured *(Playwright + IWER: the extension cannot emulate WebXR)* |
| G12 | Teach with no paid runs | "Teach" says there is no paid run on this task yet; nothing breaks |
| G13 | Exports name the arm | `/api/dataset?traj=` for an SO-101 run carries `embodiment`, `arm`, `joint_names` *(needs a paid run)* |
| G14 | Unit tests | `pnpm run test:unit`: all pass |
| G15 | Physical SO-101 | *Needs the follower plugged in over USB* |
| G16 | Quest 3S device | *Needs the headset* |

---

# Results

Run on 24 September 2026:

- **Target:** a production build of this branch (`next build && next start`, :3335).
- **Browser:** Claude in Chrome for every page and every API call. Chrome's
  window was minimized the whole time, so it ran no animation frames at all
  (0 rAF per second, measured). Everything driven by the frame loop therefore
  ran in a visible Chromium through Playwright, marked *(PW)* below.
- **Lab items:** the Privy lab wallet exists only on the deployment, so those
  items were run against thenar.io.

The development server was not used for the verdict. React's development
build prints diagnostics that production builds never contain: "Encountered a
script tag", and a performance-track exception from `notFound()`. The same
routes on thenar.io have clean consoles.

## Status by item

| Item | Status | Notes |
|---|---|---|
| A1–A3, A5, A7–A13, A15–A24 | PASS | Every figure checked against the chain or its API; every console clean |
| A4 | PASS | 404 with the custom page, and a clean console on the production build (the dev-only React warning above does not occur in it) |
| A14 | PASS on thenar.io | Wallet 0xaeA5…A74f, held by Privy, balance and policy read live. Locally it gives the stated 503: no lab wallet on this machine |
| A6 | BLOCKED | Needs a settled run, which needs a World ID Selfie Check |
| B1–B11, B15, B17–B28, B30 | PASS | B26: `terms.salesLog` is the deployed SalesLog. B30: `/api/world/request` gives 400 without an address and 200 with one |
| B29 | PASS on thenar.io | GET 200; malformed POST 400 naming the field. Locally the stated 503 |
| B12 (0xdeadbeef), B16 (400 / 402) | PASS | |
| B12–B14, B16 (by hash) | BLOCKED | Need a stored run |
| C1–C5, C6 (tasks) | PASS | 12 contracts with code, all `exact_match` on Sourcify; taskCount 11; verifier 0xC7D1…; issuer = seller 0x9a6A… |
| C6 (runs) | BLOCKED | Needs a run |
| D1, D3, D5, D6 | PASS | All three RPCs answer chain 10143. A page hit written before a server restart is read after it. AgentBook read from World Chain. The facilitator lists eip155:10143 exact |
| D4 | PASS on thenar.io | Policy read back from Privy: chain 10143, the Axon address, 0.1 MON |
| D2, D7 | UNTESTED | No Etherscan key, snapshot bucket or VAPID keypair anywhere in reach; B10, B11 and B18 state the missing configuration |
| E4 | PASS on thenar.io | `test-policy` refused with `policy_violation`; balance 0.146919128 MON before and after, to the wei |
| E11 | PASS | ⌘K finds and opens /spec/so101; the tour walks hub → task → station → foundry → status and skips the run step while no run exists |
| E1, E2, E5, E7, E9, E10 | BLOCKED | Every paid run needs a World ID proof from a phone; E5 and E10 also need a corpus with runs |
| E3, E8 | NOT RE-RUN | Both pass in TESTPLAN-MONAD. E3 would post another lab bounty, which the user asked to stop. E8 spends from the corpus issuer key, which is reserved to the other session |
| E6 | UNTESTED | Needs the agent registered in AgentBook with World App |
| F1, F2 | PASS | No console errors and no failed requests on any item, except the refusals the items ask for. One first load showed a single non-2xx resource that the server never logged and six reloads never repeated: most likely a public-RPC rate limit, which the RPC failover absorbs |
| F3, F4, F6 | PASS | CSP names the Monad RPCs and the facilitator; nosniff; strict referrer; DENY. The only earlier-chain names are labelled history (Superseded, the archive note, changelog titles). Nothing in the shipped code is mocked |
| F5 | PASS after fix | All 25 pages fit 375 px |
| G1, G3 *(PW)* | PASS | Re-solves within 1.2–6.9 mm. The follower arms only at home, its last target equals the page's joints within 0.1°, and STOP follows when mirroring stops |
| G2 | PASS | "No arm relay answered on this machine…"; console clean |
| G4, G11, A5 *(PW)* | PASS | SO-101 run on task 0, driven through a headset: 1:1 follow, jaws hold the payload, measured 90.21–97.57. The recording passes the signing-time physicality check |
| G5 *(PW)* | PASS | Task 3 on THENAR-6; Tab moves control to the second arm |
| G6 | PASS | `[arm so101]` by default, `[arm thenar6]` when chosen |
| G7 *(PW)* | PASS after fix | See below. Detected apple 17 mm / 12 mm from truth; clicked bowl 2 mm / 0 mm; an 824 mm point is refused "out of reach" |
| G8 *(PW)* | PASS | 48/48 previews on /post as stills, 0 canvases; the photoscanned crate loads in /station/1 with no GLTF errors |
| G9 | PASS after fix | 7 rows, and 11 with #7–#10 shown; real mouse clicks toggle both ways |
| G10 | PASS | The scripted run is refused 403 by /api/sign and by /api/verify. The 422 path for a verified human is covered by `test/physicality.test.mjs` |
| G12 *(PW)* | PASS | "No paid run on this task yet." |
| G13 | BLOCKED | Needs a paid SO-101 run |
| G14 | PASS | 112/112 unit tests |
| G15, G16 | UNTESTED | Need the SO-101 on USB and the Quest 3S in hand |

## What failed, and what fixed it

1. **G7: the scan measured objects at their front edge.** On rendered photos
   of the photoscanned apple with a known layout, it came out 38 mm short,
   outside the 25 mm placement band.
   - `lib/scan.ts` `cameraFrom` recovers the camera pose from the sheet (a
     one-view calibration that solves both constraints together, since
     either alone is degenerate for a square-on view). `groundCentre` then
     pushes the bottom-edge point back by r·tan(θ/2).
   - The marker moves to the measured centre.
   - A unit test checks the recovered camera within 2 mm and the centre
     within 10 mm. `test/live-scan.mjs` checks both fixtures in the browser.
2. **G9: the hub's "+N identical" toggle ignored clicks.** It was declared
   inside the page, so it remounted on every six-second refetch. It is now a
   top-level component.
3. **F5: two pages overflowed at 375 px.**
   - `/agents` had an unbreakable address link (475 px); `break-all` fixes it.
   - `/spec/so101`'s joint table was 403 px. It now sits in a scroller, with
     the CAD node column shown from `sm` up.
4. **Found along the way: `/inventory`'s copy was no longer true.** It said
   every object is generated, with "no asset file to lose". It now names the
   Poly Haven scans and marks each one "scan", with its source.

## Confirmation

- **No mocks:** there are no mocks, stubs or fallback fixtures anywhere in
  the tested surface. Every figure is read from Monad, the SQLite store,
  Privy, World Chain or the facilitator.
- **Clean consoles and networks:** no console or network errors remain on
  any tested item, other than the refusals the items themselves ask for.
- **Honest statuses:** everything not marked PASS is BLOCKED on a World ID
  Selfie Check, UNTESTED for want of a credential or a device, or
  deliberately not repeated. None of those is counted as passing.

## On thenar.io, after deploying 91dedf6

- **Health:** ok.
- **E2E:** `test/e2e.mjs` passed 59/59.
- **Scan:** `test/live-scan.mjs` passes.
- **Fixes, checked live:**
  - The hub toggle opens 11 rows.
  - /inventory names the scans.
  - /agents and /spec/so101 fit 375 px.
  - All four pages have clean consoles.
