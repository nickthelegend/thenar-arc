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

### Phase 1 — Truthfulness of displayed data · **CLOSED 30 Aug**

Was the dealbreaker: the feed reported 25 runs against a contract holding 12.
The other 13 were Monad-era rows carried across the chain switch and rendered
with "verify →" links to Snowtrace, where those transactions do not exist.

Now: feed 12, contract 12, archive 13, and every transaction resolves on the
chain its row claims. `/api/health` fails with 503 if that ever stops holding.

| # | Task | Status |
|---|---|---|
| 1.1 | Add `chain_id` to `trajectory`. Left NULL for existing rows rather than defaulted — guessing is what caused the bug | **DONE** |
| 1.2 | Resolver in `/api/reconcile` offers each hash to every known chain and records the one returning a receipt. Production: 13 → Monad, 12 → Fuji, 0 unknown | **DONE** |
| 1.3 | All three read functions scoped to `appChain.id`; every caller goes through them | **DONE** |
| 1.4 | `ledgerMatchesChain` in `/api/health`. Negative test: mislabelling 3 rows produced HTTP 503 and the exact message | **DONE** |
| 1.5 | `/archive` + `/api/archive`, linked from the footer and the leaderboard. Runs kept, labelled, linked to MonadScan | **DONE** |
| 1.6 | Verified on production: feed 12 = `trajectoryCount()` 12; 12/12 feed txs resolve on Fuji; 13/13 archive txs resolve on Monad; 0 leak | **DONE** |

### Phase 2 — Console and client hygiene

| # | Task | Status |
|---|---|---|
| 2.1 | Not mount ordering — two selectors genuinely matched nothing. The hero paragraph never carried `data-anim="hero-copy"`, and `DimRule` emitted `data-anim="rule"` only from its noted branch, so all three landing rules were invisible to it. Both fixed; console clean | **DONE** |
| 2.2 | All 10 pages checked live on thenar.io: zero console output of any kind | **DONE** |
| 2.3 | Confirmed real from the code path — the panel gated on telemetry while the button gated on phase, so they diverge whenever frames are held. Panel now follows phase | **DONE** |

### Phase 3 — Wallet reach

| # | Task | Status |
|---|---|---|
| 3.1 | **BLOCKED** — verified absent from local env, Vercel (no vars set) and Railway (20 vars listed). Getting one requires creating a Reown account, which I cannot do |
| 3.2 | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` on Vercel and on the Railway service | BLOCKED by 3.1 |
| 3.3 | Verify the connect modal offers MetaMask, Rainbow and WalletConnect, and that a mobile wallet pairs by QR | BLOCKED by 3.1 |
| 3.4 | Test the full run→submit loop from a phone browser end to end | BLOCKED by 3.1 |

### Phase 4 — Make Avalanche load-bearing

Ranked in `docs/AVALANCHE-50.md`. The top two answer a constraint `PRODUCT.md`
already names: *"first-run cost has to be near zero."*

| # | Task | Status |
|---|---|---|
| 4.1 | **BLOCKED, and deliberately not attempted.** An L1 validator has to stay up; the only hosted route is AvaCloud, which needs an account I cannot create. An L1 run from a laptop dies with the laptop, and moving the contracts onto it would replace a working product with one pointing at a dead chain |
| 4.2 | BLOCKED by 4.1 |
| 4.3 | BLOCKED by 4.1 |
| 4.4 | **BLOCKED on testnet gas.** Teleporter is confirmed live and identical (26,029 bytes) on Fuji C-Chain, Dispatch (779672) and Echo (173750), so no L1 of ours is needed — but the deployer holds 0 gas on both L1s and their faucet needs interactive wallet access I cannot complete |
| 4.5 | `lib/glacier.ts` + `/api/glacier/[address]` + a portfolio section. Verified: 22 real settlements for the deployer, selectors decoded from the ABI, reverted calls shown as reverted. Free tier, no key | **DONE** |
| 4.6 | BLOCKED by 4.4 |

### Phase 5 — The shared space · **BUILT 30 Aug**

Was the one substantial product feature missing. Built without Phase 4's L1:
presence never touches a chain, so it needed neither parallel execution nor
sub-second blocks.

| # | Task | Status |
|---|---|---|
| 5.1 | `lib/server/space.ts`: one room per task, N operators, presence only. Each run is still recorded, signed and settled independently — presence is never scored | **DONE** |
| 5.2 | Done without a WebSocket. Pose up and roster down in one round trip at 6 Hz, which survives the Vercel→Railway proxy that a long-lived socket would not, and needs no custom server | **DONE** |
| 5.3 | `Ghosts` in the viewport: marker plus a dropped line, scene coords `(x, z, -y)` matching the payload. **Data path verified live** (roster renders from the same array); the 3D markers themselves could not be seen in the automated browser because it holds `requestAnimationFrame` — the arm does not render there either |
| 5.4 | Each operator drives their own payload and is measured alone, by design — a shared payload would let one operator destroy another's paid run. Presence is visual only | **DONE, by a different design** |
| 5.5 | Same code path with nothing to report. Verified: an unconnected browser sees both operators and their carry state | **DONE** |

### Phase 6 — Data quality

| # | Task | Status |
|---|---|---|
| 6.1 | Replace the kinematic sim with contact-rich physics (MuJoCo WASM or Rapier), keeping the same `Sample` shape so the scorer and contract are unchanged | NOT STARTED |
| 6.2 | Re-derive the jerk band and par time from ≥200 human episodes using `calibrate()` | NOT STARTED |
| 6.3 | **Not a gap.** The export already populates `state.joints`, `state.gripper`, `state.object_pose`, `action` and `timestamp` from the stored samples. The plan's note was wrong | **DONE** |
| 6.4 | Record camera frames so `channels: 3` is true rather than reserved | NOT STARTED |

### Phase 7 — Durability

| # | Task | Status |
|---|---|---|
| 7.1 | Migrate SQLite → Railway managed Postgres with automated backups. Four tables; the only copy of the corpus currently lives on one volume | NOT STARTED |
| 7.2 | Move the verifier key into a private Railway service reachable only over the internal network | NOT STARTED |
| 7.3 | GET handler added (Vercel's scheduler only issues GET) and a daily cron in `vercel.json`. Verified idempotent | **DONE** |
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
