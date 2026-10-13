# Core loop on the public Arc testnet: proof

`pnpm e2e:testnet` ([scripts/e2e-core.mjs](../scripts/e2e-core.mjs), the same script as `pnpm e2e:core` pointed at
`NEXT_PUBLIC_ARC_NETWORK=testnet`) runs the core loop with real signed transactions on **Arc testnet (chain 5042002,
`https://rpc.testnet.arc.io`), not a fork**, against this repo's production build (`next build` + `next start`, port 9010)
and its deployed contracts (`deployments/arc-testnet.json`; ThenarProtocol `0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619`).
Raw output: [e2e-testnet.log](e2e-testnet.log). Run on 2026-10-13 (16:46Z).

Setup: a gitignored `.env.local` holds `NEXT_PUBLIC_ARC_NETWORK=testnet`, the verifier key (signer), the corpus issuer/auditor
key, and three fresh throwaway wallets (relayer, x402 facilitator, buying agent) funded from the deployer with 0.2 to 0.4
USDC each. Privy needs an app id this repo does not ship, so sign-in shows "unavailable" (the app's documented fallback); the loop
below drives the real routes (`/api/verify`, `/api/submitted`, `/api/agent/corpus`) from a script instead of a browser wallet,
as the fork proof does. The operator is a fresh key with 0 USDC: the relayer pays its gas.

Explorer: `https://explorer.testnet.arc.io/tx/<hash>`

| # | Step | Transaction |
|---|---|---|
| 0a | Fund the four wallets from the deployer (USDC `transfer`, 6-dec): issuer, relayer, facilitator, agent | [issuer](https://explorer.testnet.arc.io/tx/0x44a6116299fce430a9845f9a8408ed8d69112447e852315f328113bfc0116d9e), [relayer](https://explorer.testnet.arc.io/tx/0xbf44fd5221a5533cca2b07fa39ac29a05f3ffef0cd92530bcac632daf4921c70), [facilitator](https://explorer.testnet.arc.io/tx/0x0cd995516a7cb2f7c493d811b53167a172279cd285c89974f4f9db7191f2368e), [agent](https://explorer.testnet.arc.io/tx/0x6d6d1215b7a4c70240ac9f909ae167c0badf3355b7a117f00dbe42af787e158b) |
| 1a | Escrow, seed task #0 funded by the deploy (`createTask`, 0.3 USDC) | [0x5f9d9c…7fa3](https://explorer.testnet.arc.io/tx/0x5f9d9cafe7a4cbbf50f73203f16a750f1642d7e6c1da949e56ef3d10cb377fa3) |
| 1b | Escrow, live top-up of seed task #1: `approve` then `ThenarProtocol.fundTask(1, 0.05 USDC)` (escrow 0.30 to 0.35, visible on `/hub`) | [approve](https://explorer.testnet.arc.io/tx/0x84fdac4530b6e1130812ebe3f19d30977175af6679b33816f53204850e9e04bc), [fundTask](https://explorer.testnet.arc.io/tx/0xa4403edddc7966e66e0df8e36c55b244b03b335bfa1279517c58bb2201309db6) |
| 2 | Operator `0x6A5A…E118` records a run (scripted browser-sim arm: 1501 samples; coherent, 0 clamped) and the issuer admits it to CorpusShares | [0xb5bb93…3e22](https://explorer.testnet.arc.io/tx/0xb5bb9309d2aadcf80314248e50ca0857a594e9d018562dff0ad69ab542543e22) |
| 3 | Verifier replays and signs (`/api/verify`, score 92.14, EIP-712) | off chain |
| 4 | **One transaction records the run and pays the operator 0.04607 USDC from task #0's escrow** (`submitTrajectoryFor`, sent by the relayer; operator balance 0 to 0.04607; escrow 0.25625 to 0.21018) | [0xa5214c…95ed](https://explorer.testnet.arc.io/tx/0xa5214ce03c81b1fd91a799ae90beeb0de756e641691b9ae3999e5cc5fe0c95ed) (block 67019091) |
| 5 | CorpusShares issue for the run (92 shares) | [0x83533e…19af](https://explorer.testnet.arc.io/tx/0x83533e0aeef1aa612a8dbdd01505f17af04eb34b49780fe62fe3799b0af6d19e) |
| 6 | **Agent buys the corpus over x402**: `402` offering 0.01 USDC on `eip155:5042002`, EIP-3009 settlement by the in-process facilitator | [0xd706dc…f19b](https://explorer.testnet.arc.io/tx/0xd706dc4eee242dc78fb77fa11d80676ccb7aa5bbbf4ac45d25d0893fad67f19b) (block 67019101) |
| 7 | `SalesLog.logSale` #2: sha256 of the served bytes | [0xb57f6c…f7e3](https://explorer.testnet.arc.io/tx/0xb57f6c65468665b6543df1f19e31900d3ecbccab2078cb70e0cc2a5a5100f7e3) |

An earlier identical pass (same script, first build; it differs only in a log label) is also on chain: admit
[0xffcaaa…4837](https://explorer.testnet.arc.io/tx/0xffcaaa2afa8f9917033d2327015cd4701b6adb7c3e868a61d54d3086cd34837c),
pay [0x047247…e96e](https://explorer.testnet.arc.io/tx/0x0472476c046151a6d51f2183df793c4cc3e7316efab1139f93bb3253d022e96e),
shares [0xe47050…0714](https://explorer.testnet.arc.io/tx/0xe47050014802276ef04048dfb0c4dd3d90c1d96ebab63a0b3401a9ed03c50714),
x402 [0x57144a…d20b](https://explorer.testnet.arc.io/tx/0x57144aecefec57e6ab236c35589fa97f75b16fae297832845f8653706059d20b),
SalesLog #1 [0xa80010…469a](https://explorer.testnet.arc.io/tx/0xa8001014b8aacffff14cf31fba98afa8e0dada565f1085355d39143e1777469a).

## Asserted (all passed)

The operator's USDC `balanceOf` rose by exactly the payout in the same transaction; the payout came out of the task's
escrow and `TrajectoryAccepted` names the operator; the unpaid request is a `402`; the paid request returns a corpus containing
the run; exactly 0.01 USDC left the agent and reached the treasury; `SalesLog.saleCount` rose 1 to 2 and the logged sha256 equals
the sha256 of the response body. `/api/health` is all green against the public chain (verifier key matches the contract,
signing domain matches, 0 stored runs vs on-chain reconciles).

## Pages against testnet

Production build, headless Chromium, 1440x900; screenshots in [screens/testnet](screens/testnet). Live data from
`rpc.testnet.arc.io`, no console or page errors (only cancelled `_rsc` link prefetches on `/hub`, `ERR_ABORTED`, which is Next dropping prefetches).

| Page | Result |
|---|---|
| `/` | 200; "Arc Testnet #<block>" chip live |
| `/hub` | 200; 5 tasks, 1.51 USDC escrow at stake read from the contract; task #0 "1/1 paid", escrow 0.26 (after the first pass) |
| `/station/0` | 200; task #0, "Arc Testnet, live", final-in-511 ms strip, 0.05 USDC per run, 5 of 6 runs left |
| `/network` | 200; live block, finality (latest/safe/finalized), USDC-is-gas check, P-256 precompile, Memo |
| `/arc` | 200; deployed addresses, x402 terms on `eip155:5042002` |
| `/run/<tx>` | 307 to `/run/<trajectory hash>` (by design), 200; "Integrity verified", score 87.50, certificate mintable |

## See the recorded runs in the app (no wallet)

`pnpm seed:proof` ([scripts/seed-proof.mjs](../scripts/seed-proof.mjs)) stores the two runs above in a checkout's own run store
from [proof/testnet-runs.json](proof/testnet-runs.json), re-reading each paying transaction from Arc testnet first (it must be
successful and carry `TrajectoryAccepted` for that run). Then `/run/<hash>` shows the replay and "Integrity verified" (the run
hash recomputed from the stored samples). Run hashes: `0x842bcb0fe0cf501035104614264a793836dc4d376c44f207642169bec538e99b`
(score 92.14, paid by [0xa5214c…95ed](https://explorer.testnet.arc.io/tx/0xa5214ce03c81b1fd91a799ae90beeb0de756e641691b9ae3999e5cc5fe0c95ed))
and `0x4a1efdd8f4c06c0bbd565657a2c776b65fc1f2d95b5d1768faa3ffa0776f4462` (score 87.50, paid by
[0x047247…e96e](https://explorer.testnet.arc.io/tx/0x0472476c046151a6d51f2183df793c4cc3e7316efab1139f93bb3253d022e96e)).
Verified from a fresh database against the public testnet on 2026-10-13; a payout costs 509,221 gas at 25 gwei (0.0127 USDC).

## Not covered

- Browser sign-in and a passkey/embedded-wallet submission: needs a Privy app id (`.env.local` here has none; sign-in shows "unavailable"). The scripted path above uses the same routes and contracts.
- Arc Memo tags, ERC-8004 verdicts, CCTP, CCIP, Gateway and gasless posting: not part of this loop (fork or not run; see `/arc`).
- The ERC-8004 agent registrations (verifier, buyer): `bindVerifier` is permanent and takes an agentURI, so it should be done once with the production origin, not localhost. Until then the buyer is logged as "not an ERC-8004 agent".
