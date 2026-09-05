# Axon

**The data foundry for physical AI.** Teleoperate a robot arm in the browser,
have the run measured against the goal datum, and get paid on Monad in the same
transaction that records the trajectory.

Built at Monad Blitz Hyderabad V3.

---

## The idea in one paragraph

Physical AI is bottlenecked by data, not compute. Robot manipulation data is
collected in closed labs — slow, expensive, too narrow to generalise. The
networks already crowdsourcing it write one small record per trajectory on
chain (a data ID bound to a task and a wallet) and keep the economics off chain:
points, non-transferable, settled by hand every fortnight, redeemable for a
possible future airdrop.

Axon writes the payment instead. A task is a funded escrow. An accepted
trajectory pays out in the call that records it. A policy is minted with its
contributor cap table attached, so a licence fee splits to everyone who trained
it without anyone claiming anything. That is several times the state writes of a
bare anchor, and those writes barely touch each other — different operators,
different tasks, one shared slot counter. It is the workload parallel execution
exists for, which is why it is on Monad.

---

## Live deployment

| | |
| --- | --- |
| **Live app** | **https://web-production-2d1d0.up.railway.app** |
| Contract | [`{axon}`](https://testnet.monadscan.com/address/{axon}) — **verified**, exact match |
| Network | Monad Testnet, chain `10143` |
| Verifier key | `{verifier}` |
| Contract metadata | [`https://web-production-2d1d0.up.railway.app/api/contract`](https://web-production-2d1d0.up.railway.app/api/contract) — address, chain and full ABI |
| Health | [`https://web-production-2d1d0.up.railway.app/api/health`](https://web-production-2d1d0.up.railway.app/api/health) |
| Hosting | Railway, with a persistent volume for the trajectory store |

## Run it

Requires Node 20+, pnpm, and an injected EVM wallet to submit runs.

```bash
pnpm install
cp .env.example .env.local   # then fill in the two values it lists
pnpm dev
```

Open http://localhost:3000. Browsing, the hub, the leaderboard, the foundry and
the station all work read-only with no wallet. Submitting a run needs a wallet
on Monad Testnet with a little MON for gas — the faucet is at
https://faucet.monad.xyz.

To regenerate the robot arm geometry (optional — the GLB is committed):

```bash
python3 -m pip install numpy && python3 cad/arm.py
```

## Verification

Every one of these runs green right now:

```bash
cd contracts && forge test              # 19 tests, incl. a 256-run fuzz
node --experimental-strip-types scripts/check-loop.ts   # IK + scoring
node scripts/e2e.mjs http://localhost:3000              # live on-chain proof
node scripts/lifecycle.mjs http://localhost:3000        # create -> fill -> mint -> licence
npx impeccable detect app components lib                # design detector
pnpm exec eslint app components lib && pnpm exec tsc --noEmit
```

`scripts/e2e.mjs` is the one that matters: it records a run, has the server
score and sign it, submits it on chain, and then asserts that the escrow fell
by exactly the payout, that the operator's balance rose by exactly the payout
net of gas, that replaying the same trajectory is refused, and that a forged
score is refused. It passes against the live deployment, not just localhost:

```
node scripts/e2e.mjs https://web-production-2d1d0.up.railway.app
```

`scripts/lifecycle.mjs` covers the other half — creating a funded task, filling
every slot, minting its policy, and buying a licence, asserting the cap table
sums to 100% and that the contributor is paid exactly its share.

Two Monad behaviours are worth knowing before you run these. Gas is reserved
against the **limit**, not usage, and the floor is higher than `value + gas`:
the same licence call reverted at 0.3 MON and settled at 2. And consensus and
execution are pipelined, so a transaction receipt means the transaction was
*ordered*, not that its state change has landed — a freshly funded account can
still fail the next transaction until the balance actually appears.

---

## What is actually built

| Surface | Route | What it does |
| --- | --- | --- |
| Landing | `/` | The thesis, with a live AXON-6 running a pick-and-place cycle |
| Hub | `/hub` | Task board — scenario, skill, difficulty, lifecycle, slots, reward |
| Station | `/station/[taskId]` | The teleoperation console: 3D viewport, recorder, live measurement |
| Portfolio | `/portfolio` | Run history, measurements, earnings, held runs |
| Leaderboard | `/leaderboard` | Operators ranked by what they produced |
| Foundry | `/foundry` | Policies with their contributor cap tables and licence split |

**The run loop.** Drive the arm with the arrow keys, `E`/`D` for height and
space for the jaws. The pose is recorded at 20 Hz. When the payload comes to
rest the measurement is taken automatically: how far its centre finished from
the goal datum, against a ±25 mm band. Placement (55%), path smoothness (25%)
and time against par (20%) resolve to one score on 0–10000. Below 4000 the run
is rejected and pays nothing.

Scoring is deterministic — the same trajectory always produces the same score,
because the payout is derived from it and a drifting score would be an
unauditable payout.

| Task detail | `/task/[id]` | Chain state plus every recorded submission and its score distribution |
| Verify a run | `/run/[hash]` | Public audit: re-hashes the stored samples and replays the tool path |
| Post a task | `/post` | Open a bounty and escrow it |
| Spec sheet | `/spec` | AXON-6, generated from the CAD constants |

**Nothing on these pages is a fixture.** Tasks, slots, escrow, scores, payouts,
standings and cap tables are all read from the contract. The trajectories behind
them are in SQLite, addressed by the same hash the chain records.

### Not built, and never presented as built

No MuJoCo rigid-body physics (the station is a kinematic sim with analytic
grasping), no IsaacSim augmentation, no trained policy, no post-training/DAgger
loop, no mobile capture, no mainnet deployment. These are named as roadmap in
the interface wherever a visitor could read them as capabilities.

---

## The arm is code

`cad/` is a parametric CAD kernel in Python — numpy only, no CSG booleans, no
CAD file to open. Every part is a surface of revolution or a swept polygon,
which keeps it manifold by construction; `arm.py` validates every part for
closure before export and fails the build if any part is open.

```
21 parts, 8080 triangles, 0 not closed
```

It writes `public/models/axon-6.glb` as a **named node hierarchy** — `J1_yaw`,
`J2_pitch`, `J3_pitch`, `J5_pitch`, `jaw_left`, `jaw_right` — which is what lets
the viewport drive the arm joint by joint from the IK solver rather than playing
a baked animation. It also writes one STL per part to `cad/exports/`.

Dimensions are named constants at the top of `cad/arm.py`; change one and rerun.
`lib/kinematics.ts` carries the same link lengths in metres — the arm and its
solver are one part.

---

## Design

The visual system is documented in [DESIGN.md](DESIGN.md) and the product truth
it serves in [PRODUCT.md](PRODUCT.md).

The world is **the inspection bench**: layout dye as the ground, a scribed line
as the ink, brass for anything the operator is paid, and a two-value verdict for
anything measured. It is not decoration — Axon's semantics are metrology, so
every recurring device (tolerance band, gauge-block slot tally, datum zone,
leader-line callouts) is a real instrument-shop device doing its actual job.

Verified clean by `npx impeccable detect` across all six routes and the whole
source tree.

---

## Deployment

The contract is deployed and verified. Redeploy with:

```bash
cd contracts && forge script script/Deploy.s.sol:Deploy   --rpc-url https://testnet-rpc.monad.xyz --broadcast --slow
```

It needs `DEPLOYER_PRIVATE_KEY` and `VERIFIER_ADDRESS` in the environment, and
it seeds eight funded task bounties as part of the same run.

**The economics.** `createTask` escrows MON against a slot count.
`submitTrajectory` checks a verifier signature, records the trajectory hash and
its content address, decrements the slot, and transfers the operator's share —
one call. `mintPolicy` snapshots the contributor cap table weighted by
cumulative quality. `licensePolicy` fans a licence fee out to every contributor
in a single transaction, crediting anyone whose transfer fails rather than
reverting the sale.

---

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · three.js via
react-three-fiber · Python (numpy) for the CAD kernel · Foundry for the
contracts.
