# Thenar

**The data foundry for physical AI.** Teleoperate a robot arm in the browser,
have the run measured against the goal datum, and get paid on Avalanche in the
same transaction that records the trajectory.

Built at Monad Blitz Hyderabad V3.

| | |
| --- | --- |
| **Live** | **https://thenar.io** |
| **Repo** | https://github.com/nickthelegend/axon-monad |
| **Chain** | Avalanche Fuji (43113) |
| **AxonProtocolV2** | [`0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0`](https://testnet.snowtrace.io/address/0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0) — Sourcify `exact_match`. Adds escrow refunds, relayed submission, and a passkey digest that works. |
| **AxonProtocol v1** | [`0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3`](https://testnet.snowtrace.io/address/0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3) — superseded; its runs are in the archive |
| **TrajectoryCertificate** | [`0x7a060129A3730852A606Bbe985207952AC25c4f6`](https://testnet.snowtrace.io/address/0x7a060129A3730852A606Bbe985207952AC25c4f6) — Sourcify `exact_match`. Soulbound; names a run's recorder and conveys no rights over the data. |
| **ConfidentialPayouts** | [`0x8CD8A9211CE32184a89F9ab9DC26224D08B775c2`](https://testnet.snowtrace.io/address/0x8CD8A9211CE32184a89F9ab9DC26224D08B775c2) — Sourcify `exact_match`. ElGamal on secp256k1: earnings add up on chain without the chain holding a number. |
| **LicenceReceipt** | [`0xbA65eC5479C9E131d158Af1947452C989eF7D143`](https://testnet.snowtrace.io/address/0xbA65eC5479C9E131d158Af1947452C989eF7D143) — Sourcify `exact_match`. Emits an Avalanche Warp message attesting a policy, signed by Fuji's validators. |
| **ContributionRecord** | [`0xa3b2dd739be34D13ca51a92ADDD0Ce2022E23247`](https://testnet.snowtrace.io/address/0xa3b2dd739be34D13ca51a92ADDD0Ce2022E23247) — Sourcify `exact_match`. A running total of work recorded, in a shape wallets read. Cannot be transferred, sold or redeemed. |
| **Referrals** | [`0x50414b04e39434Fc66527Fc7c816d835C766AC32`](https://testnet.snowtrace.io/address/0x50414b04e39434Fc66527Fc7c816d835C766AC32) — Sourcify `exact_match`. Pays for bringing someone who then does the work, not for signing up. |
| **Foundry** | [`0xFf4007B14d3bb18a409EF9eF1ac6DD21e601783E`](https://testnet.snowtrace.io/address/0xFf4007B14d3bb18a409EF9eF1ac6DD21e601783E) — Sourcify `exact_match`. A treasury the protocol's contributors vote to spend on new tasks, weighted by work recorded. |
| **PrizePool** | [`0x42912F9a437C8EcF2a90Cb18F49D8a54DDe3F84f`](https://testnet.snowtrace.io/address/0x42912F9a437C8EcF2a90Cb18F49D8a54DDe3F84f) — Sourcify `exact_match`. Funded pot for one task; contributors enter themselves and it splits by work the protocol recorded. |
| **CorpusAccess** | [`0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165`](https://testnet.snowtrace.io/address/0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165) — Sourcify `exact_match`. Time-boxed read access to the corpus. Sells time, not rights. |
| **PasskeyRegistry** | [`0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F`](https://testnet.snowtrace.io/address/0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F) — Sourcify `exact_match` |
| **Every contract, read live** | [`https://thenar.io/contracts`](https://thenar.io/contracts) — all eleven with balances, code size, the surface that uses each, and live readings from those with state |
| **Hosting** | Vercel (frontend, custom domain) + Railway (API, Postgres, and a signer service holding the verifier key) |

> **The directory is named `monad-blitz` and the git remote is `axon-monad`.**
> Both are from the build this started as; the product is Thenar and it settles
> on Avalanche. The names are left alone so the history stays traceable.
>
> **Built at Monad Blitz Hyderabad V3, where it placed 3rd.** It ran on Monad
> then; it settles on Avalanche now. The Monad deployment and the two
> transactions in the demo below are left in place because they happened, and
> the audits in [MONAD.md](MONAD.md) and [MONAD-2.md](MONAD-2.md) are kept as
> the record of that build — they describe the Monad deployment, not what
> thenar.io runs today.

---

## Demo

Drive the arm, place the payload, get paid, then buy a licence and watch the fee
split across every contributor. Both transactions are real and linked below.

![Axon demo — pick and place, payout, and the transaction on Monad](docs/demo.gif)

**[▶ Watch the full 2:54 demo](https://github.com/nickthelegend/axon-monad/releases/download/demo-v1/axon-demo.mp4)** — no narration, download or stream from the release.

<video src="https://github.com/nickthelegend/axon-monad/releases/download/demo-v1/axon-demo.mp4" controls muted playsinline width="100%"></video>

The two transactions the video shows, on Monad Testnet:

| Step | Transaction | Block |
| --- | --- | --- |
| Payout — `submitTrajectory` records the run and pays the operator | [`0x4496b36a…434c5433`](https://testnet.monadscan.com/tx/0x4496b36a16be3f5b622305d058314212c0ab820eebda8fd1dd5cc2c4434c5433) | 55950354 |
| Licence — `licensePolicy` pays the whole cap table in one call | [`0x139bc19e…73f14b9a`](https://testnet.monadscan.com/tx/0x139bc19e419194a12034059fb92cc864016a4ee5012b679f9acc1ecc73f14b9a) | 55950691 |

---

## Contracts

Solidity, Foundry, deployed and source-verified on **Avalanche Fuji (chain
43113)**. The full set with addresses is in the table at the top of this file;
every one reports `exact_match` on Sourcify, so the verified source is the
source in this repo.

The pair below is the **Monad Testnet** deployment this project was built on at
Monad Blitz Hyderabad V3. It is kept because it happened, and because the demo
video and its two transactions are from it. It is not what the live app talks
to.

| Contract (Monad Testnet, historical) | Address | Source |
| --- | --- | --- |
| `AxonProtocol` — tasks, escrow, trajectories, policies, cap tables | [`0x89384f46…C0d6Ed4`](https://testnet.monadscan.com/address/0x89384f46e430F37DB61Afb98810eba995C0d6Ed4) | [`contracts/src/AxonProtocol.sol`](contracts/src/AxonProtocol.sol) |
| `PasskeyRegistry` — secp256r1 verification via the P256 precompile at `0x0100` | [`0xD6dE823E…DE65E165`](https://testnet.monadscan.com/address/0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165) | [`contracts/src/PasskeyRegistry.sol`](contracts/src/PasskeyRegistry.sol) |

What the protocol does, in the order the video shows it:

- **`createTask`** escrows `slots × rewardPerTrajectory` up front. A task that
  cannot pay is not a task.
- **`submitTrajectory`** takes the trajectory hash, the task, and a score the
  verifier signed with EIP-712. It records the run and transfers the reward in
  the same call — there is no separate claim. Replays revert `AlreadySubmitted`;
  an unsigned score reverts `BadSignature`.
- **`mintPolicy`** snapshots the contributor cap table when a task fills, weights
  in basis points summing to 10000.
- **`licensePolicy`** pays every contributor pro-rata in one transaction. A payee
  that refuses transfers is credited instead of reverting the sale, and can pull
  later with `claim`.

Slot counters are **sharded** (`MAX_SHARDS`, `SLOTS_PER_SHARD`) so concurrent
submissions to the same task write to different storage slots. The design was
made for Monad, where a shared counter forces optimistically-parallel execution
to re-run transactions serially. Avalanche C-Chain executes sequentially, so
that particular argument does not apply on Fuji — the sharding stays because it
costs nothing, still removes the one contended write, and is what the deployed
contract does.

Tests: [`contracts/test/AxonProtocol.t.sol`](contracts/test/AxonProtocol.t.sol)
(23, including a 256-run fuzz and the sharding invariants) and
[`contracts/test/PasskeyRegistry.t.sol`](contracts/test/PasskeyRegistry.t.sol)
(10, run against a fork because the P256 precompile cannot be `vm.etch`ed).

```bash
cd contracts && forge test
cd contracts && forge test --match-contract PasskeyRegistry --fork-url https://testnet-rpc.monad.xyz
```

---

## The idea in one paragraph

Physical AI is bottlenecked by data, not compute. Robot manipulation data is
collected in closed labs — slow, expensive, too narrow to generalise. The
networks already crowdsourcing it write one small record per trajectory on
chain (a data ID bound to a task and a wallet) and keep the economics off chain:
points, non-transferable, settled by hand every fortnight, redeemable for a
possible future airdrop.

Thenar writes the payment instead. A task is a funded escrow. An accepted
trajectory pays out in the call that records it. A policy is minted with its
contributor cap table attached, so a licence fee splits to everyone who trained
it without anyone claiming anything. That is several times the state writes of a
bare anchor, and those writes barely touch each other — different operators,
different tasks, one shared slot counter. It is the workload parallel execution
exists for, which is why it was built on Monad. It settles on Avalanche now,
where the argument for the chain is different — see the top of this file.

---

## The Monad deployment

Historical. This is what the project ran on at Monad Blitz Hyderabad V3, and
what the demo video shows. The live app settles on Avalanche Fuji — see the
table at the top of this file.

| | |
| --- | --- |
| AxonProtocol | [`0x89384f46e430F37DB61Afb98810eba995C0d6Ed4`](https://testnet.monadscan.com/address/0x89384f46e430F37DB61Afb98810eba995C0d6Ed4) — **verified**, exact match |
| PasskeyRegistry | [`0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165`](https://testnet.monadscan.com/address/0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165) — **verified**, exact match |
| Network | Monad Testnet, chain `10143` |

## Live endpoints

| | |
| --- | --- |
| **Live app** | **https://thenar.io** |
| Network | Avalanche Fuji, chain `43113` |
| Verifier key | `0x5beE0b22906c28F747279217F5C8019c39fB086b` — held only by the signer service |
| Contract metadata | [`https://thenar.io/api/contract`](https://thenar.io/api/contract) — address, chain and full ABI |
| Health | [`https://thenar.io/api/health`](https://thenar.io/api/health) |
| Hosting | Vercel serves the pages. **Every `/api/*` request is rewritten to the Railway `web` service**, so an API change deployed only to Vercel changes nothing. Postgres and an isolated signer service also run on Railway |

## Run it

Requires Node 20+, pnpm, and an injected EVM wallet to submit runs.

```bash
pnpm install
cp .env.example .env.local   # then fill in the two values it lists
pnpm dev
```

Open http://localhost:3000. Browsing, the hub, the leaderboard, the foundry and
the station all work read-only with no wallet, and the station's practice mode
records a run without one. Submitting a run for payment needs a wallet on
**Avalanche Fuji** with a little AVAX for gas — the faucet is at
https://core.app/tools/testnet-faucet/ (select Fuji C-Chain).

To regenerate the robot arm geometry (optional — the GLB is committed):

```bash
python3 -m pip install numpy && python3 cad/arm.py
```

## Verification

Every one of these runs green right now:

```bash
cd contracts && forge test              # 23 tests, incl. a 256-run fuzz
cd contracts && forge test --match-contract PasskeyRegistry \
  --fork-url https://testnet-rpc.monad.xyz            # 10, against the real precompile
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
node scripts/e2e.mjs https://thenar.io
```

`scripts/lifecycle.mjs` covers the other half — creating a funded task, filling
every slot, minting its policy, and buying a licence, asserting the cap table
sums to 100% and that the contributor is paid exactly its share.

Two Monad behaviours were worth knowing when these ran there, and are recorded
because the numbers below came from that deployment. Gas is reserved
against the **limit**, not usage, and the floor is higher than `value + gas`:
the same licence call reverted at 0.3 MON and settled at 2. And consensus and
execution are pipelined, so a transaction receipt means the transaction was
*ordered*, not that its state change has landed — a freshly funded account can
still fail the next transaction until the balance actually appears.

---

## What is actually built

| Surface | Route | What it does |
| --- | --- | --- |
| Landing | `/` | The thesis, with a live THENAR-6 running a pick-and-place cycle |
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
| Spec sheet | `/spec` | THENAR-6, generated from the CAD constants |

**Nothing on these pages is a fixture.** Tasks, slots, escrow, scores, payouts,
standings and cap tables are all read from the contract. The trajectories behind
them are in Postgres, addressed by the same hash the chain records.

### Not built, and never presented as built

The station is still a kinematic sim with analytic grasping, and every payout
is derived from that — MuJoCo is in the project but measures the recordings
rather than driving them, reporting per run how far each is from rigid-body
dynamics (about 1.3 mm, against a ±25 mm band). No IsaacSim augmentation, no
trained policy, no post-training/DAgger
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

It writes `public/models/thenar-6.glb` as a **named node hierarchy** — `J1_yaw`,
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
anything measured. It is not decoration — Thenar's semantics are metrology, so
every recurring device (tolerance band, gauge-block slot tally, datum zone,
leader-line callouts) is a real instrument-shop device doing its actual job.

Verified clean by `npx impeccable detect` across all ten routes and the
whole source tree.

---

## Deployment

The contract is deployed and verified. Redeploy with:

```bash
cd contracts && forge script script/Deploy.s.sol:Deploy   --rpc-url https://testnet-rpc.monad.xyz --broadcast --slow
```

It needs `DEPLOYER_PRIVATE_KEY` and `VERIFIER_ADDRESS` in the environment, and
it seeds eight funded task bounties as part of the same run.

**Sharded slot accounting.** A single `slotsFilled` counter is one storage
slot that every operator on a task writes to, which on an optimistically
parallel chain forces them to re-execute serially — the exact anti-pattern
Monad punishes, and the reason this was built. On Avalanche's sequential
C-Chain the contention argument does not apply; the shape is kept because it is
what is deployed and it costs nothing. Each operator instead writes only the shard their address
maps to, and each shard carries its own quota, so concurrent submissions from
different operators touch no shared state. A caller whose own shard is spent
falls back to a scan; that is the only path that can contend and it only
happens at the margin. `slotsFilledOf` sums the shards as a view, so reads
never contend at all.

The first deployment (`0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F`) carried the
single-counter version and is kept for the record.

**Passkeys.** Both chains ship the P-256 precompile at `0x0100` — EIP-7951 on
Monad, RIP-7212 on Avalanche — so a
secp256r1 signature — the curve a passkey already uses — can be verified by the
chain itself. `PasskeyRegistry` binds a public key to an address and spends
signatures through it, and `submitTrajectoryWithPasskey` lets an operator
authorise a run with that key rather than their wallet. The browser surface that
demonstrated it was cut when wallet connection moved to RainbowKit, so the proof
now lives in the fork tests: a genuine WebCrypto vector is accepted, the same
signature with one bit flipped is refused, for about 34k gas. Ethereum mainnet has no
such precompile; verifying secp256r1 there costs hundreds of thousands of gas
in Solidity.

This exists because Thenar's operators are gig workers, and the seed phrase is
where that funnel dies.

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
