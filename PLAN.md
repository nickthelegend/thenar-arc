# Thenar — build plan

State as of 30 Aug 2026. Everything below was measured against the live app at
https://thenar.io and Avalanche Fuji, not read off the source.

| | |
|---|---|
| Live | https://thenar.io (Vercel) · API + SQLite volume on Railway |
| Chain | Avalanche Fuji, 43113 |
| AxonProtocol | `0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3` — Sourcify `exact_match` |
| PasskeyRegistry | `0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F` — Sourcify `exact_match` |
| GRASP (thenar-avax) | GraspLog, LeafVerifier, TaskRegistry, FoundryMarket — all `exact_match` |
| On chain now | 8 tasks · 12 trajectories · 1 minted and licensed policy |
| Off chain now | 25 DB rows · 16 generated props · 2 uploaded props |

---

## 1. Goals

### What "done" means

Thenar is done when a stranger with a browser can complete this loop unaided,
and a stranger with money can verify it afterwards:

1. Land, understand what the product does, and open a task without reading docs.
2. Drive the arm through that task and see the run measured against the datum.
3. Submit and be paid in the same transaction that records the trajectory.
4. Open the transaction on a public explorer and see the payout.
5. A buyer licences the corpus and every contributor is paid pro-rata in one call.

Steps 1–5 all work today. **Done is not "the loop runs" — it is "every number
the interface shows is true".** That is the gap that matters.

### What "winning" means

Judged on innovation, technical execution, design, usefulness, sponsor tech and
presentation, Thenar wins by being the submission whose claims survive being
checked. Concretely:

- **W1** Every figure rendered reconciles with chain state. A judge who clicks
  any explorer link lands on a transaction that exists.
- **W2** Avalanche is load-bearing, not a chain-id. Today it scores 3/10 on a
  sponsor track: generic C-Chain RPC and nothing else.
- **W3** A judge with no browser extension can still reach the product on a phone.
- **W4** The console is silent on every page.
- **W5** The roadmap is visibly labelled as roadmap. No kinematic sim presented
  as physics, no seeded data presented as traffic.

---

## 2. Phases

Ordered by what blocks what. Phase 1 is the only phase that changes whether the
project survives a skeptical review; everything after it raises the ceiling.

### Phase 1 — Truthfulness of displayed data · **BLOCKS EVERYTHING**

The dealbreaker. The feed reports 25 runs; the contract has 12. The other 13 are
Monad-era rows migrated with the chain switch, rendered with "verify →" links to
Snowtrace where the transactions do not exist.

| # | Task | Status |
|---|---|---|
| 1.1 | Add `chain_id INTEGER` to the `trajectory` table in `lib/server/db.ts`, defaulting to 43113 for new rows | NOT STARTED |
| 1.2 | Backfill the 13 pre-migration rows with `chain_id = 10143` — identify them by testing each `tx_hash` against both RPCs, not by date | NOT STARTED |
| 1.3 | Filter `recentTrajectories`, `trajectoriesForTask` and `countTrajectories` to the active chain, so `/api/feed`, `/leaderboard`, `/task/[id]` and `/portfolio` only show runs from the chain the app is on | NOT STARTED |
| 1.4 | Add an integrity check to `/api/health`: DB row count for the active chain must equal `trajectoryCount()`; report `ok: false` when it does not | NOT STARTED |
| 1.5 | Decide and implement the archive surface for the 13 Monad rows — either a `/archive` page that links MonadScan and says plainly they are from the previous deployment, or delete them. Do not leave them unlabelled | NOT STARTED |
| 1.6 | Re-verify: `/api/feed` total equals `trajectoryCount()`, and every `tx_hash` in the feed resolves on Fuji | NOT STARTED |

### Phase 2 — Console and client hygiene

| # | Task | Status |
|---|---|---|
| 2.1 | Fix the 8 GSAP warnings on `/`. All six `data-anim` keys exist in markup, so this is mount ordering: run the timeline in `useLayoutEffect` after the targets mount, or guard each `.from()` with a presence check | NOT STARTED |
| 2.2 | Re-run the console check on all 10 pages; zero warnings and zero errors | NOT STARTED |
| 2.3 | Confirm the station's HUD never shows "Begin the run to take a live reading" while the button reads END RUN — reproduce in a background tab where `rAF` is throttled, and drive state from the run's own clock rather than frame callbacks | NOT STARTED |

### Phase 3 — Wallet reach

| # | Task | Status |
|---|---|---|
| 3.1 | Obtain a free `projectId` from cloud.reown.com | **BLOCKED** — needs an account only the owner can create |
| 3.2 | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` on Vercel and on the Railway service | BLOCKED by 3.1 |
| 3.3 | Verify the connect modal offers MetaMask, Rainbow and WalletConnect, and that a mobile wallet pairs by QR | BLOCKED by 3.1 |
| 3.4 | Test the full run→submit loop from a phone browser end to end | BLOCKED by 3.1 |

### Phase 4 — Make Avalanche load-bearing

Ranked in `docs/AVALANCHE-50.md`. The top two answer a constraint `PRODUCT.md`
already names: *"first-run cost has to be near zero."*

| # | Task | Status |
|---|---|---|
| 4.1 | Stand up a Thenar L1 via AvaCloud or `avalanche-cli`, Subnet-EVM, custom gas token | NOT STARTED |
| 4.2 | Configure the fee manager precompile so `AxonProtocol` calls cost an operator zero gas | NOT STARTED |
| 4.3 | Redeploy AxonProtocol and PasskeyRegistry to the L1; migrate the task catalogue | NOT STARTED |
| 4.4 | Wire licence settlement from C-Chain to the L1 over Teleporter — the messenger is live on Fuji at `0x253b2784…0aa5fcf` | NOT STARTED |
| 4.5 | Replace the portfolio's DB reads with Glacier Data API queries so history survives the server disappearing | NOT STARTED |
| 4.6 | Add an ICM message-status indicator for cross-chain licences | NOT STARTED |

### Phase 5 — The shared space

The one substantial product feature still missing. Needs Phase 4's L1 to work
well: many operators writing independently in the same scene is what parallel
execution and sub-second blocks are for.

| # | Task | Status |
|---|---|---|
| 5.1 | Design the multi-operator session model: one sampled world, N operators, each run settled independently | NOT STARTED |
| 5.2 | Add a presence/state channel — WebSocket service on Railway, since serverless cannot hold connections | NOT STARTED |
| 5.3 | Render other operators' tool positions as ghosts in the viewport | NOT STARTED |
| 5.4 | Per-operator scoring inside a shared scene, with the payload owned by whoever grasped it first | NOT STARTED |
| 5.5 | Spectator mode: watch a live session without a wallet | NOT STARTED |

### Phase 6 — Data quality

| # | Task | Status |
|---|---|---|
| 6.1 | Replace the kinematic sim with contact-rich physics (MuJoCo WASM or Rapier), keeping the same `Sample` shape so the scorer and contract are unchanged | NOT STARTED |
| 6.2 | Re-derive the jerk band and par time from ≥200 human episodes using `calibrate()` | NOT STARTED |
| 6.3 | Populate `observation.state` and `action` in the LeRobot export — currently null, correctly labelled "Simulated capture" | NOT STARTED |
| 6.4 | Record camera frames so `channels: 3` is true rather than reserved | NOT STARTED |

### Phase 7 — Durability

| # | Task | Status |
|---|---|---|
| 7.1 | Migrate SQLite → Railway managed Postgres with automated backups. Four tables; the only copy of the corpus currently lives on one volume | NOT STARTED |
| 7.2 | Move the verifier key into a private Railway service reachable only over the internal network | NOT STARTED |
| 7.3 | Schedule `/api/reconcile` — the endpoint exists and nothing calls it | NOT STARTED |
| 7.4 | Nightly corpus snapshot to object storage | NOT STARTED |

### Phase 8 — Already done, keep verified

| # | Task | Status |
|---|---|---|
| 8.1 | Six contracts deployed and Sourcify `exact_match` on Fuji | **DONE** |
| 8.2 | `submitTrajectory` records and pays in one call — 12 real trajectories | **DONE** |
| 8.3 | `mintPolicy` + `licensePolicy` — task 7 filled 6/6, policy minted, 0.02 AVAX licence fanned out | **DONE** |
| 8.4 | Reverts confirmed by selector: `AlreadySubmitted` `BadSignature` `CapReached` `NotFilled` `WrongFee` | **DONE** |
| 8.5 | 16 props generated from named dimensions; the scene matches the instruction | **DONE** |
| 8.6 | Model upload with real glTF validation, dedup, and selection in `/post` | **DONE** |
| 8.7 | Persisted SQLite on a Railway volume, surviving redeploys | **DONE** |
| 8.8 | Design system committed; Impeccable detector reports 0 findings | **DONE** |
| 8.9 | Input validation on `/post` — five malformed inputs, five specific errors | **DONE** |
| 8.10 | Mobile: no horizontal overflow, nav scroll affordance | **DONE** |

---

## 3. Gap list

Ordered by severity. Each tied to the task that closes it.

### Dealbreakers

| Gap | Where | Blocks |
|---|---|---|
| **Feed shows 25 runs, chain has 12.** 13 Monad-era rows render with "verify →" links to Snowtrace transactions that do not exist on Fuji. Verified: feed's oldest tx `0x0777ad35c80019f4…` is absent on Fuji, present on Monad block 55922119 | `lib/server/db.ts` `recentTrajectories`, `app/api/feed`, `/leaderboard`, `/task/[id]` | 1.1–1.6, W1 |

### Real deductions

| Gap | Where | Blocks |
|---|---|---|
| **Avalanche is a chain-id, not an integration.** Zero Avalanche packages in 25 deps; only generic C-Chain JSON-RPC at runtime | `lib/chain.ts` | Phase 4, W2 |
| **8 GSAP console warnings on `/`** — all six `data-anim` keys exist in markup, so this is mount ordering | `components/landing-motion.tsx:31,34` | 2.1, W4 |
| **WalletConnect disabled.** No `projectId` anywhere, so the modal offers Browser Wallet and Coinbase only — a phone cannot connect at all | `lib/wagmi.ts:14` | Phase 3, W3 |
| **No contact physics.** Kinematic sim with analytic grasping; correctly listed as a non-capability but limits the data's value | `components/station/viewport.tsx`, `lib/kinematics.ts` | 6.1 |
| **No shared space.** Single-operator station only | — | Phase 5 |

### Polish

| Gap | Where | Blocks |
|---|---|---|
| Station HUD can read "Begin the run to take a live reading" while the button reads END RUN when frames are throttled. Not separated from the test environment — reproduce before fixing | `app/station/[taskId]/page.tsx` | 2.3 |
| `/api/reconcile` exists and nothing schedules it | `app/api/reconcile/route.ts` | 7.3 |
| LeRobot export ships `observation.state` and `action` as null | `app/api/dataset/route.ts` | 6.3 |
| Corpus lives only on one SQLite volume | Railway `web-volume` | 7.1 |

### Not gaps — verified clean

- **Zero** mock / stub / fake / dummy / TODO / FIXME across `app`, `components`, `lib`, `contracts/src`
- Impeccable detector: 0 findings on source; live computed-style scan across four pages shows 0 gradients, 0 backdrop blur, 0 drop shadows, 0 off-ramp sizes, 0 forbidden fonts, 0 emoji, 0 infinite animations
- All 10 pages and 11 API routes return 200; `/api/health` 6/6

---

## 4. If only one thing gets done

**Phase 1.** Everything else raises the ceiling; Phase 1 is the floor. The
project's entire claim is that its numbers are checkable, and right now half
the runs on screen link to transactions that do not exist on the chain the app
says it runs on. It is also the cheapest fix in this document.
