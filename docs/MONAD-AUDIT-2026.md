# Is Monad used here now? — audit, 30 Aug 2026

This supersedes nothing. `MONAD.md` and `MONAD-2.md` audited the Monad
deployment and remain accurate about it. This audits **what thenar.io runs
today**, which is Avalanche Fuji, and asks what returning to Monad would buy.

---

## 1. What Monad offers — measured, not read

Both chains sampled over 20 blocks from their own heads on 30 Aug 2026.

| | Monad testnet | Avalanche Fuji | Ratio |
| --- | --- | --- | --- |
| **Block time** | **0.30 s** | 4.95 s | **16.5× faster** |
| **Block gas limit** | **150,000,000** | 32,000,000 | **4.7×** |
| Base fee | 100 gwei | 0 gwei | — |
| Client | `Monad/0.16.0` | coreth | — |
| **P-256 precompile `0x0100`** | **present** | **present** | **no advantage** |
| EIP-4844 blobs | `blobGasUsed 0x0` — unsupported | — | — |
| Max contract size | 128 KB (init 256 KB) | 24 KB | 5.3× |

**Correction to `MONAD.md`.** That audit listed the P-256 precompile as a Monad
capability the project exploited. It is real and it works — but it is **not a
differentiator**: Fuji answers the identical call identically. Verified by
signing with WebCrypto secp256r1 and calling `0x0100` on both chains: valid
returns `0x…01`, tampered returns `0x`. `eth_getCode` cannot test this, because
a precompile has no bytecode.

The genuine Monad-only properties are **parallel execution**, **asynchronous
execution** (a receipt means ordered, not executed), the **block time**, and the
**gas limit**.

## 2. Usage in the running app — strict

| Classification | Finding |
| --- | --- |
| **GENUINELY USED** | **Nothing.** Zero Monad code paths. `lib/chain.ts` is chain 43113; every RPC call at runtime goes to `api.avax-test.network`. |
| **IMPORTED BUT UNUSED** | Nothing — there was never a Monad SDK, only an RPC URL. |
| **FAKED** | Nothing. 0 mock/stub/TODO hits across `app`, `components`, `lib`, `contracts/src`. |
| **MISSING** | Parallel execution, async execution, sub-second settlement, the 150M gas limit, the 128 KB contract ceiling. |
| **STALE, NOW FIXED** | Three live links sent operators to `faucet.monad.xyz` while the app pays in AVAX — `station/[taskId]:488`, `site-nav:132`, `submit.ts:59`. Now `FAUCET_URL` in `lib/chain.ts`. The README advertised the Monad contracts as the live deployment; it now names the Fuji ones. |

**One piece of Monad-shaped engineering survives and still earns its place:**
`AxonProtocol` shards its slot counters (`MAX_SHARDS = 32`,
`SLOTS_PER_SHARD = 8`, `contracts/src/AxonProtocol.sol:71`) so concurrent
submissions to one task write to different storage slots. That was designed for
Monad's parallel execution. On Fuji it is harmless and mildly wasteful — the
chain executes serially, so the shards buy nothing.

## 3. Honest status

**Monad is not used.** Not lightly, not partially — the app moved off it. What
remains is a design decision (sharded counters) aimed at an execution model the
current chain does not have, plus a historical deployment and two audits that
are now marked historical.

## 4. Where Monad would organically fit — and where it would be forced

**The one that is not a preference, it is arithmetic.** `PRODUCT.md` defines
success as: *"an operator finishing a task and seeing MON arrive before they
have let go of the mouse."* A 4.95 s mean block time makes that impossible —
a submit waits ~2.5 s for inclusion before anything else happens. At 0.30 s it
is ~0.15 s, under the threshold where a person still reads the payment as part
of the same action. **The product's own definition of success is not reachable
on Avalanche's block time.** That is the strongest honest argument for Monad in
this entire document, and it is measured rather than asserted.

**The second is the shape of the write load.** Per-trajectory settlement plus
royalty fan-out across a cap table is many independent state writes — different
contributors, different tasks, no shared hot state except a slot counter the
contract already shards. That is the workload parallel execution exists for,
and the sharding is already built.

**Where it would be forced, and I am not proposing it:** anything leaning on the
128 KB contract size (AxonProtocol is nowhere near 24 KB), anything about blobs
(unsupported), and any "Monad-native" framing of the passkey path — both chains
verify P-256 identically, and claiming otherwise is the kind of thing a judge
checks in one call.

---

## 5. Fifty features that would use Monad for real

Ranked by how load-bearing Monad specifically is — measured against Fuji, not
against a generic chain. Tier 1 is unbuildable at 4.95 s blocks or serial
execution. Tier 5 runs anywhere.

Capability keys: **BT** 0.30 s block time · **PAR** parallel execution ·
**ASYNC** asynchronous execution (receipt = ordered, not executed) ·
**GAS** 150 M block gas limit · **SIZE** 128 KB contracts · **SHARD** the
sharded counters already in `AxonProtocol`

### Tier 1 — the product's stated success criterion depends on these (1–10)

| # | Feature | Uses | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **Payment inside the gesture.** Settle the run and show the payout before the operator releases the mouse. At 0.30 s this is one perceptual event; at 4.95 s it is a wait. | BT | Core | It is the product's written definition of success, and it is measurable live |
| 2 | **Optimistic-free UI.** Show the confirmed on-chain state, never a pending guess, because confirmation arrives inside a frame budget. | BT + ASYNC | Core | Most demos fake this with a spinner; this one would not need to |
| 3 | **Per-sample anchoring.** Anchor every 20 Hz trajectory in the same block it was recorded, not a batched digest. 150 M gas makes the write budget real. | GAS + BT | Core | Provenance granularity nobody else can afford |
| 4 | **Concurrent operators on one task, unserialised.** Fifty operators submitting to the same task simultaneously, each writing its own shard. | PAR + SHARD | Core | The sharding already exists and does nothing on Fuji — this makes it load-bearing |
| 5 | **Live leaderboard from chain, not cache.** Rank recomputed per block because a block is 300 ms. | BT | Core | Removes the DB as a trust dependency |
| 6 | **Receipt-ordered submission queue.** Exploit async execution: accept a run the moment it is ordered, settle when executed, and show both states honestly. | ASYNC | Core | Requires understanding Monad's execution model rather than reading a docs page |
| 7 | **Fan-out to a 500-contributor cap table in one transaction.** 150 M gas makes a fan-out that would exceed a 32 M block feasible. | GAS | Core | The closing frame of the pitch, at a size Fuji cannot fit |
| 8 | **Sub-second dispute window.** A buyer can challenge a run before the next one is recorded. | BT | Core | Only coherent when blocks are shorter than a human reaction |
| 9 | **Real-time multi-operator session.** Several operators in one shared scene, each action settled independently in parallel. | PAR + BT | Core | This is the "space to play" idea, and it needs both properties |
| 10 | **Per-run royalty accrual.** Update every contributor's accrued balance on every licence rather than at claim time. | PAR + GAS | Core | Write-heavy by design; serial execution makes it quadratic |

### Tier 2 — strongly better on Monad, degraded but possible elsewhere (11–24)

| # | Feature | Uses | Depth |
|---|---|---|---|
| 11 | Trajectory checkpointing mid-run, so a disconnect loses seconds not the run | BT + GAS | Core |
| 12 | On-chain replay verification of a submitted trajectory | GAS | Core |
| 13 | Slot reservation that expires in blocks rather than minutes | BT | Deep |
| 14 | Live escrow burn-down shown per block as slots fill | BT | Deep |
| 15 | Parallel policy minting across many tasks at once | PAR | Deep |
| 16 | Score recomputation on chain for a challenged run | GAS | Core |
| 17 | Per-block pass-rate telemetry in the station HUD | BT | Deep |
| 18 | Competitive time-attack mode with on-chain settlement per attempt | BT + PAR | Core |
| 19 | Streaming payout as the run progresses, not at the end | BT | Core |
| 20 | On-chain anti-sybil scoring over submission timing | PAR | Deep |
| 21 | Batch licence of many corpora in one transaction | GAS | Deep |
| 22 | Full cap table stored on chain rather than a root | GAS + SIZE | Deep |
| 23 | Verifier rotation without redeploy, using the larger contract ceiling | SIZE | Deep |
| 24 | Cross-task operator ranking recomputed per block | PAR + BT | Deep |

### Tier 3 — genuine but modest Monad coupling (25–36)

25 Block-time indicator in the HUD · 26 Confirmation-latency histogram per
operator · 27 Gas-on-limit reserve warning (Monad reserves against the limit) ·
28 Async-aware nonce handling in the submit path · 29 Shard-utilisation
diagnostics for funders · 30 Per-block escrow reconciliation job ·
31 Parallel-safe idempotent submit retry · 32 Contract-size headroom for a
richer scoring function · 33 Multicall batching of a screen of reads ·
34 Live block-height watermark on the feed · 35 Reorg-aware receipt handling ·
36 Fee-history chart for funders sizing an escrow

### Tier 4 — Monad-flavoured, works elsewhere (37–45)

37 MonadScan deep links · 38 MON-denominated pricing · 39 Monad faucet link on
low balance · 40 Chain-id guard · 41 Network badge · 42 Testnet/mainnet switch ·
43 Explorer-linked internal transfers · 44 Gas estimate before submit ·
45 Wallet network-switch prompt

### Tier 5 — swappable for any EVM chain (46–50)

46 Wallet connect · 47 Receipt polling · 48 Native balance display ·
49 EIP-712 signed scores · 50 Event-log indexing

---

## What I would actually do

**#1 is the whole argument.** Not because Monad is fast in the abstract, but
because this product wrote down a success criterion — payment arriving before
the operator lets go — that 4.95 s blocks cannot satisfy and 0.30 s blocks can.
Everything else in Tier 1 follows from that one measurement.

**#4 is free.** The sharded counters are already written and already deployed.
On Fuji they buy nothing. On Monad they are the feature.

**Do not claim the passkey path as a Monad advantage.** Both chains verify
P-256 identically — I tested both. `MONAD.md` claims otherwise and is wrong on
that point; it is marked historical for other reasons, but this one is worth
correcting out loud.
