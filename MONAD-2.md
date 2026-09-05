# Monad audit, round two

Written after the v2 deploy. Everything below was verified against the live
chain in this session, not read off a docs page. The first audit is in
[MONAD.md](MONAD.md) and is kept for the record — its verdict has changed.

## 1. Is Monad genuinely used?

**Yes, and it is now load-bearing rather than incidental.** The previous audit's
honest finding was that the project used only Monad's EVM-compatible half and
"could run on any fast EVM chain." That is no longer true. Three of the four
capabilities it named as missed are now shipped.

| Capability | Status | Where |
| --- | --- | --- |
| **P256 precompile `0x0100`** (EIP-7951) | **SHIPPED** | `PasskeyRegistry` at `0xD6dE823E…`, verified. `AxonProtocol.submitTrajectoryWithPasskey` composes with it. `/passkey` proves it live in a browser. |
| **Parallel-execution-safe writes** | **SHIPPED** | `AxonProtocol._record` writes only the caller's shard; `slotsFilledOf` sums as a view. |
| **Multicall3 batching** | **SHIPPED** | `lib/chain.ts` declares it; a screen of reads is one `eth_call`. |
| **Sub-second settlement** | **SHIPPED, measured** | 630 ms, 696 ms, 747 ms, 0.98 s on real submits, surfaced in the UI. |
| **Gas-on-limit / reserve rule** | **HANDLED** | The station warns below the floor; the wallet's own wording is translated. |
| **Asynchronous execution** | **HANDLED** | Scripts wait for execution to catch up; it broke the seed deploy until they did. |
| **150M block gas limit** | barely used | A submit spends ~200k of 150,000,000. |
| **128 KB contract size** | barely used | 22,882 bytes of 131,072 — 17%. |
| **Staking precompile `0x1000`** | **MISSING** | Live, holds 4.46 B MON, untouched. |
| **EIP-7702 delegation** | **MISSING** | Untouched; every submit is its own signature. |
| **EIP-4844 blobs** | n/a | Type-3 transactions are unsupported on Monad. |

### Genuinely used, with the flow a judge can trigger

- `lib/submit.ts` — the write path: verify → sign → `submitTrajectory` → receipt,
  measuring settlement latency and gas. **A real transaction, live.**
- `lib/write.ts` — `createTask`, `mintPolicy`, `licensePolicy`.
- `lib/hooks.ts` — eight read hooks, batched through Multicall3.
- `app/passkey/page.tsx` — generates a secp256r1 key in the browser and has the
  chain verify it. **The only surface here that is impossible on Ethereum.**
- `app/api/verify` — reads `getTask` on chain before it will sign a score.

### Imported but unused, faked, or absent

**None.** Every wagmi/viem import resolves to a real call; the seeded catalogue
and synthetic standings were deleted when the surfaces moved to chain reads.

### The honest remaining weakness

The 150M gas limit and the 128 KB contract size are the two capabilities still
sitting idle, and they are the two that would let this project do something no
other data network can: **put the trajectory itself on chain, and verify its
quality there.** Everything at the top of the list below attacks that.

## 2. Where deeper integration actually fits

Three places, and only three. Anywhere else would be forced:

1. **The scoring function.** It is currently the server's word, signed. Moving
   the arithmetic on chain makes the payout trustless, and it only fits in a
   150M-gas block.
2. **The operator's identity.** Passkeys landed; session keys and delegation are
   the natural continuation, and 7702 is exactly that.
3. **The funder's capital.** Bounties are pre-funded and idle. The staking
   precompile turns that float into yield.

Anything else — an NFT gallery, a token, a governance forum — would be bolted on
to qualify for a track, and I would not build it.

## 3. Fifty features, ranked by how load-bearing Monad is

### Tier A — impossible or pointless off Monad

| # | Feature | Capability | Depth | Why a judge notices |
| --- | --- | --- | --- | --- |
| 1 | On-chain smoothness scoring — recompute mean jerk from a stored digest inside the contract | 150M gas + 128 KB + linear memory | Core | The payout stops depending on a trusted server. Infeasible at 30M gas. |
| 2 | Passkey-only operator accounts — a smart account whose sole signer is a WebAuthn key | `0x0100` + CREATE2 | Core | Onboarding a non-crypto worker in ten seconds, live |
| 3 | Session keys — one passkey signature authorises a whole session of runs | `0x0100` + EIP-7702 | Core | One prompt per hour instead of per run |
| 4 | Yield-funded bounties — funders stake, operators are paid from rewards | Staking precompile `0x1000` | Core | The bounty never depletes; uses a precompile that exists nowhere else |
| 5 | Trajectory digest stored on chain, not just its hash | 128 KB contracts | Core | "The data is on chain" is a claim almost nobody can make |
| 6 | Per-checkpoint settlement inside a single run | 150M gas + sub-second blocks | Core | Paid continuously rather than per task |
| 7 | Batch session settle via a 7702 delegate | EIP-7702 | Core | Twenty runs, one signature |
| 8 | Sharding benchmark page — fire N concurrent submits, chart which block each landed in | Parallel execution | Core | Makes the v2 fix measurable instead of asserted |
| 9 | On-chain success checking — geometric goal test in the contract | 150M gas | Core | Removes the last trusted step |
| 10 | Passkey-gated licence purchase for labs with no wallet software | `0x0100` | Core | Enterprise buyer, no crypto stack |
| 11 | Staked reputation — operators stake to raise their score weight, slashed for rejects | `0x1000` | Core | Real economic skin, using Monad's own staking |
| 12 | Delegated funders — a lab delegates its EOA to a budget contract | EIP-7702 | Core | Spend controls without a multisig |
| 13 | On-chain domain randomisation seed commitments per trajectory | 128 KB + gas | Deep | Reproducibility that a dataset buyer can audit |
| 14 | Live settlement histogram from real receipts | Sub-second finality | Core to the pitch | Sub-second is only a claim until you plot it |
| 15 | Cross-task shard rebalancing when one shard starves | Parallel execution | Deep | Shows the sharding is understood, not copied |

### Tier B — strongly better on Monad

16 Micro-tips between operators · 17 Streaming escrow top-up per block ·
18 Dutch-auction rewards decaying per block · 19 Instant refund inside one block ·
20 On-chain duplicate detection via a rolling Bloom filter in a 128 KB contract ·
21 Per-sample anchoring every 100 frames · 22 Quality-weighted streaming
royalties per licence-second · 23 Live policy order book with sub-second
matching · 24 Slot reservation with a 60-second on-chain expiry · 25 On-chain
par-time recalibration from the real distribution · 26 Reputation decay computed
per block · 27 Multi-embodiment registry as one 128 KB contract · 28 On-chain
DAgger intervention log · 29 Funder dashboard reading escrow burn per block ·
30 Gas-cost transparency against the 150M ceiling · 31 Passkey recovery via a
second registered key · 32 Contract-level rate limiting by block number ·
33 Escrow auto-sweep to staking when idle · 34 Per-shard leaderboards ·
35 On-chain task generation from a seed

### Tier C — real, but the chain is incidental

36 Policy NFTs (ERC-721) · 37 Transferable licences with resale royalty ·
38 Funder escrow withdrawal · 39 Task cloning · 40 Verifier key rotation ·
41 Multisig treasury · 42 On-chain dispute window · 43 Contributor allowlists ·
44 Task expiry and escrow return · 45 Referral attribution

### Tier D — swappable for any chain

46 Generic ERC-20 payouts · 47 Fiat on-ramp · 48 ENS-style operator names ·
49 Cross-chain licence bridging · 50 Token launch — which I would actively
argue against: it adds a speculative asset to a product whose whole claim is
that the payment is real work for real money.

## 4. What I would build next

**#8, the sharding benchmark.** The v2 fix is the most Monad-specific thing in
the project and right now it is only assertable, not demonstrable. A page that
fires concurrent submits and charts the blocks they land in turns an
architectural claim into a measurement — and it needs no new capability, only
the gas to run it.
