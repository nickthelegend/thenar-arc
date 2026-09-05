# Is Monad actually used here?

Short answer: **yes, load-bearing, not a checkbox** — but only the *EVM-compatible*
half of Monad. Everything below was verified against the live chain, not read
off a docs page.

---

## 1. What Monad actually offers

Verified directly against `testnet-rpc.monad.xyz` (client `Monad/0.16.0`,
chain `10143`) on 22 Aug 2026:

| Capability | Verified how | Result |
| --- | --- | --- |
| Sub-second blocks | Sampled 6 consecutive blocks | Δ 0–1 s, mostly **0 s** |
| Block gas limit | `eth_getBlockByNumber` | **150,000,000** (5× Ethereum's 30M) |
| **P256 precompile `0x0100`** | Signed a message with WebCrypto secp256r1, called the precompile | **Returned `0x…01`. Tampered signature returned `0x`.** |
| Staking precompile `0x1000` | `eth_getBalance` | Live, holds **4.46 billion MON** |
| EIP-1559 | `baseFeePerGas` on latest block | Yes, base fee 100 gwei |
| EIP-4844 blobs | `blobGasUsed` | `0x0` — **type-3 transactions unsupported** |
| Max contract size | Docs | **128 KB** (Ethereum: 24 KB); init code 256 KB |
| Memory pricing | Docs | **Linear**, not quadratic; 8 MB max per tx |
| Gas charging | Docs | On the **limit**, not usage — a consequence of asynchronous execution |
| EIP-7702 | Docs | Supported, with a 10 MON floor and no `CREATE` from delegated EOAs |

The parts that matter and that most projects never touch: **the P256
precompile, the 150M gas limit, the 128 KB contract size, and parallel
execution's sensitivity to hot state.**

---

## 2. Strict audit of this codebase

### GENUINELY USED — a judge can trigger these and watch them work

| Where | What it does |
| --- | --- |
| `contracts/src/AxonProtocol.sol` | Deployed at [`0x89384f46e430F37DB61Afb98810eba995C0d6Ed4`](https://testnet.monadscan.com/address/0x89384f46e430F37DB61Afb98810eba995C0d6Ed4), **verified `exact_match`**. 8 funded tasks, 4 trajectories, 0.35 MON escrowed. |
| `lib/submit.ts` | The real write path: `submitTrajectory` → `waitForTransactionReceipt`, measuring settlement latency and gas from the receipt. |
| `lib/write.ts` | `createTask`, `mintPolicy`, `licensePolicy` writes with decoded revert names. |
| `lib/hooks.ts` | Eight distinct read hooks — `getTasks`, `getTask`, `runsOnTask`, `trajectoriesOf`+`getTrajectory`, `stats`, `trajectoryCount`, `policyCount`+`getPolicy`, `capTable`. |
| `lib/wagmi.ts` | `http(..., { batch: true })`. **Verified batching**: a single HTTP request carrying 4 `eth_call`s. |
| `components/site-nav.tsx` | `useBlockNumber({ watch: true })` — the live block in the header. |
| `app/api/verify/route.ts` | Server reads `getTask` on chain before it will sign a score. |
| `app/api/health/route.ts` | Cross-checks the server's verifier key against `verifier()` on chain. |

**Live proof, measured in the browser:** hooking `window.fetch` on `/hub`
captured **8 JSON-RPC requests to `testnet-rpc.monad.xyz` in 9 seconds**, all
200, including one batched request carrying four `eth_call`s.

**Four real transactions** were signed and confirmed while building this.
Settlement latency measured from send to receipt: **123 ms, 638 ms, 648 ms,
1274 ms**.

### IMPORTED BUT UNUSED
**None.** Every `wagmi` / `viem` import resolves to a call on a real path.

### FAKED
**None remaining.** `lib/tasks.ts` (208 lines) and `lib/network.ts` (82 lines)
held a seeded catalogue and synthetic standings. They were already orphaned
when the surfaces moved to chain reads; they are now deleted, because fixture
data sitting in the tree reads as faked state to anyone auditing the project.

### MISSING — Monad capabilities this project does not touch

1. ~~**P256 precompile `0x0100`** — verified working, entirely unused.~~ **Now shipped.** `PasskeyRegistry` at [`0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165`](https://testnet.monadscan.com/address/0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165) binds a secp256r1 key to an address and verifies signatures through the precompile; `register()` and `authorise()` have both executed on chain, replay and forgery are refused, and `/passkey` demonstrates it live for about 34k gas.
2. **Staking precompile `0x1000`** — unused.
3. **EIP-7702 delegation** — unused; every submit is a separate signature.
4. **128 KB contract size** — `AxonProtocol` is ~10 KB. Ethereum's 24 KB limit is not even close to binding here.
5. **150M block gas limit** — a submit uses ~200 K. Using 0.13% of a block.
6. **Linear memory pricing / 8 MB transaction memory** — untouched.
7. ~~**Parallel execution** — worse than unused: the contract has a *contention bug*.~~ **Fixed and redeployed in v2.** The slot counter is sharded per operator, so concurrent submissions write disjoint state.
8. **Asynchronous execution semantics** — gas-on-limit and the reserve balance are not surfaced anywhere.

---

## 3. The honest verdict

Monad is **genuinely the settlement layer**, not a logo. The core claim —
"the trajectory is recorded and paid in one transaction" — is real, on a real
verified contract, and a judge can fire it live.

**Updated after the passkey work landed.** The audit below was written when
this could have run on any fast EVM chain. That is no longer true: the P256
precompile is Monad-specific and now load-bearing, so the project uses a
capability Ethereum mainnet does not have. Two of the four "biggest misses"
below — the precompile itself, and Multicall3 batching — are closed. The
remaining two, the staking precompile and EIP-7702, are still untouched.

The original wording is kept for the record:

But right now this could run on **any** fast EVM chain. Nothing in it needs
*Monad specifically*. The pitch says "per-trajectory settlement is only
affordable at Monad's throughput" and that argument is sound, but the code does
not yet *demonstrate* it: it makes one small transaction at a time and never
touches the four things that are actually unique to this chain.

The fix is not to bolt on an integration. It is that this product has an
obvious, non-forced need for exactly the capability Monad uniquely ships:
**operators are non-crypto users doing repetitive work, and asking them for a
seed phrase is the single biggest drop-off in the funnel. P256 at `0x0100`
means they can sign runs with Touch ID.** That is the integration that belongs
here.

---

## 4. Contract changes I would make

### 4a. ~~Fix the parallel-execution contention bug~~ — shipped

`submitTrajectory` writes `t.slotsFilled += 1` on a **single storage slot
shared by every operator on that task**. Monad executes optimistically and
re-runs conflicting transactions serially. Ten operators submitting to the same
task in one block all touch that slot, so nine of them get re-executed — on the
one chain where that is measurable, this project builds the exact anti-pattern.

```solidity
// Now: every submitter contends on one slot.
t.slotsFilled += 1;

// Better: shard the counter, reconcile lazily.
mapping(uint256 => mapping(uint256 => uint32)) private _shardFilled;  // task => shard => count
uint256 constant SHARDS = 32;

function _claimSlot(uint256 taskId) private {
    uint256 shard = uint256(uint160(msg.sender)) % SHARDS;
    _shardFilled[taskId][shard] += 1;   // 32 independent slots, ~no contention
}

function slotsFilled(uint256 taskId) public view returns (uint32 n) {
    for (uint256 i; i < SHARDS; ++i) n += _shardFilled[taskId][i];
}
```

The trade is a more expensive view for a dramatically more parallel write. On
Monad that is the right side of the trade.

**Shipped.** The deployed version scales the shard count to the task size,
gives each shard its own quota so the common path needs no cross-shard read,
and falls back to a scan only when a caller's own shard is spent. Writing it
surfaced a real flaw first: address-based sharding confines an operator to one
shard, so a 4-slot shard quota could block the 5-run allowance the product
promises. The shard floor now sits above the per-account cap, and a test
covers it.

Same treatment for `totalEarned` / `totalRuns` / `totalScore`, which are
per-address and therefore already contention-free — those are fine.

### 4b. Add a passkey submission path (P256, `0x0100`)

```solidity
address constant P256_VERIFY = 0x0000000000000000000000000000000000000100;

/// A run signed by a passkey instead of an EOA. `pubKey` is the operator's
/// registered secp256r1 key; the contract verifies it natively.
function submitTrajectoryWithPasskey(
    uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score,
    bytes calldata verifierSig,          // still required: the score is the server's word
    bytes32 r, bytes32 s                 // the operator's passkey signature
) external {
    PubKey memory k = passkeyOf[msg.sender];
    bytes32 digest = keccak256(abi.encode(taskId, trajHash, cid, score));
    (bool ok, bytes memory out) = P256_VERIFY.staticcall(
        abi.encodePacked(digest, r, s, k.x, k.y)
    );
    if (!ok || out.length != 32 || uint256(bytes32(out)) != 1) revert BadPasskey();
    ...
}
```

This is not decoration — it removes the seed phrase from the operator funnel,
which is the product's actual growth bottleneck.

### 4c. Contracts to add

| Contract | Why |
| --- | --- |
| `AxonAccount.sol` | A minimal smart account whose sole signer is a passkey verified through `0x0100`. Operators get an address from Touch ID, no extension, no seed phrase. |
| `AxonAccountFactory.sol` | CREATE2 deployment so an operator's address is known before their first run, and their first run can fund it. |
| `PolicyNFT.sol` | Policies are currently structs. Make them ERC-721 so a licence is transferable and shows in a wallet — that is what "the policy is an on-chain asset" should mean. |
| `AxonBatch.sol` | An EIP-7702 delegation target: `submitMany(Run[] calldata)` so an operator settles a whole session in one signature. |
| `TaskFactory.sol` | Deploys one lightweight task contract per bounty. Different tasks then touch **different contracts**, which is the cleanest possible parallelism story. |
| `StakedTreasury.sol` | Funders stake MON through the `0x1000` precompile; bounties are paid from yield so the principal is returned. |

### 4d. Smaller contract fixes

- `licensePolicy` loops over up to 256 contributors. At 150M block gas that is
  comfortable, but add `licensePolicyRange(id, start, count)` so it degrades
  gracefully rather than reverting at scale.
- `Task.name` is a `string` in storage, read on every `getTasks`. Move it to an
  event and index it off-chain; storage strings are the most expensive field here.
- Pack `Task`: `slotsTotal`/`slotsFilled`/`scenario`/`difficulty`/`policyMinted`
  already share a slot, but `rewardPerTrajectory` and `escrow` as two `uint128`
  do too — confirm with `forge inspect AxonProtocol storage-layout`.
- Add `error` for the `RUNS_PER_ACCOUNT` cap being configurable per task rather
  than a global constant.
- Emit `slotsRemaining` in `TrajectoryAccepted` so a client can update without a
  follow-up read.

---

## 5. Fifty features that use Monad for real

Ranked by **how load-bearing Monad is** — the ones at the top are impossible or
pointless anywhere else; the ones at the bottom would work on any EVM chain.

### Tier A — needs Monad specifically. Could not ship this on Ethereum L1.

| # | Feature | Capability | Depth | Why a judge notices |
| --- | --- | --- | --- | --- |
| 1 | **Touch ID run signing** — operator signs each accepted run with a passkey; the contract verifies secp256r1 natively | P256 precompile `0x0100` (EIP-7951) | Core — the whole auth model | No seed phrase in a robotics data app. Verifiably impossible on Ethereum today. |
| 2 | **Passkey-only operator accounts** — a smart account whose only signer is a WebAuthn key; no EOA ever exists | `0x0100` + CREATE2 | Core | Onboarding a non-crypto gig worker in 10 seconds, live on stage. |
| 3 | **Per-checkpoint settlement** — pay at each sub-goal inside a run, not once at the end | 150M block gas + sub-second blocks | Core | Turns "paid per task" into "paid continuously". Absurd at 30M gas / 12 s. |
| 4 | **Shard-free slot claiming** — the contention fix above, with a live A/B benchmark | Parallel execution | Core | A measured chart of contended vs sharded throughput *on Monad* is the single most on-track artefact possible. |
| 5 | **Session batch settle** — a whole 20-run session in one signature via a 7702 delegate | EIP-7702 | Core | One wallet prompt for an hour of work. |
| 6 | **Full trajectory summary on chain** — store a compressed 40 KB pose digest in contract storage, not just a hash | 128 KB contracts, linear memory | Core | "The data itself is on chain" is a claim almost nobody can make. |
| 7 | **Yield-funded bounties** — funders stake through `0x1000`; operators are paid from staking rewards | Staking precompile | Core | The bounty never depletes. Uses a precompile that exists nowhere else. |
| 8 | **Live settlement HUD** — the block number and millisecond latency of your payout, on screen as it lands | Sub-second finality | Core to the demo | Already half-built (`blockMs`). At 12 s blocks there is nothing to show. |
| 9 | **Throughput burst demo** — fire N submits concurrently, plot which block each landed in | Parallel execution + 150M gas | Core | The Monad thesis, made visible in one screen. |
| 10 | **Passkey-gated policy licensing** — a lab buys a licence with a hardware key, no wallet software | `0x0100` | Core | Enterprise buyer with no crypto stack. |
| 11 | **Per-task contracts** via `TaskFactory` — different tasks touch different addresses | Parallel execution | Core | Zero cross-task contention by construction. |
| 12 | **On-chain jerk verification** — recompute the smoothness term inside the contract from the stored digest | 128 KB + linear memory + 150M gas | Core | The score becomes trustless, not verifier-signed. Genuinely infeasible elsewhere. |
| 13 | **Micro-tipping between operators** — 0.0001 MON tips on a leaderboard, viable because gas is negligible | Sub-second, cheap blocks | Core | Social layer that only works when a tx costs nothing and lands instantly. |
| 14 | **Streaming escrow top-up** — funders drip MON per block instead of pre-funding | Sub-second blocks | Core | Capital efficiency that needs fast blocks to feel continuous. |
| 15 | **Reserve-balance-aware UX** — warn the operator before a submit that Monad's gas-on-limit rule would revert | Gas charged on limit; reserve balance | Deep | Shows genuine understanding of Monad's async execution model. Almost nobody handles this. |

### Tier B — strongly better on Monad; the economics only work here

16 **Per-sample provenance anchoring** (a hash every 100 frames, not per run) — 150M gas · 17 **Real-time leaderboard from chain, no indexer** — sub-second blocks make polling honest · 18 **On-chain DAgger intervention log** — every takeover a tx · 19 **Slot reservation with expiry** — claim a slot for 60 s, cheap enough to be disposable · 20 **Instant refund on rejected run** — round-trip inside one block · 21 **Dutch auction on task rewards** — price decays per block · 22 **Per-block escrow rebalancing across tasks** · 23 **On-chain duplicate detection** via a rolling Bloom filter in a 128 KB contract · 24 **Quality-weighted streaming royalties** paid per licence-second · 25 **Live policy order book** with sub-second matching · 26 **Operator reputation as an on-chain rolling window** updated every run · 27 **Task funder dashboard** reading escrow burn per block · 28 **Gas-cost transparency** — show the real gas of every action against the block's 150M · 29 **Multi-embodiment registry** as one 128 KB contract holding every arm's kinematics · 30 **On-chain par-time calibration** recomputed from the real distribution every N runs

### Tier C — good use of the chain, but not Monad-specific

31 Policy NFTs (ERC-721) · 32 Transferable licences with resale royalty · 33 Funder escrow withdrawal · 34 Task cloning · 35 Delegated verifier rotation · 36 Multi-sig treasury · 37 On-chain dispute window · 38 Contributor allowlists per task · 39 Task expiry and escrow return · 40 Referral attribution on chain · 41 Batch `capTable` reads via multicall · 42 Event-indexed activity feed · 43 On-chain task metadata URI · 44 Pausable contract · 45 Upgradeable proxy

### Tier D — the chain is swappable; build these only if time is free

46 Generic ERC-20 payouts · 47 Fiat on-ramp · 48 Wallet-agnostic connect UI · 49 ENS-style operator names · 50 Cross-chain licence bridging

---

## 6. What I would build next, in order

1. **The contention fix (#4)** — it is a bug, it is Monad-specific, and it is benchmarkable.
2. **Passkey signing (#1, #2)** — the P256 precompile is verified working and it solves this product's real onboarding problem.
3. **The throughput burst demo (#9)** — makes the pitch's central claim visible.
4. **Per-checkpoint settlement (#3)** — the most striking use of a 150M gas limit.

Everything else is decoration next to those four.
