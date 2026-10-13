# Judge + fix pass, 2026-10-13 (Arc testnet only)

Criteria from the DoraHacks page. Scores are /10, strict. "Before" is the repo at `9cce09f`; "after" is this commit.
Budget used: 0 new testnet USDC (the live e2e from `docs/E2E-TESTNET.md` was reused; its 13 transactions were re-read
from the public RPC and all succeed, `SalesLog.saleCount` is 2).

| Criterion | Before | After | Why |
|---|---|---|---|
| Relevance to Arc | 7 | 8 | USDC-as-gas, one-tx payout and x402 in USDC are genuinely Arc-shaped and run live. Held back from 9 because ERC-8004, Memo, CCTP, CCIP and passkeys have only run on a fork. |
| Technical credibility | 5 | 7 | Before: README still said "testnet deploy pending", `/arc` said the verifier "is an agent in Arc's Identity Registry" (it is not registered), and rows read as live that were fork-only. After: every row carries Live (testnet) / Fork / Not run, backed by a unit test that fails if a fork-only piece is ever labelled live. |
| Quality of what was built | 7 | 8 | 24 routes x desktop and 390px: no console errors, no failed requests, no overflow, no broken images, no old-chain text. 147 unit tests pass, typecheck clean, lint 0 errors. Deployed, escrow-backed, 10 contracts, Slither reviewed. |
| Worth taking further | 7 | 7 | Real thing, real market framing. Still weak: no hosted URL, no browser sign-in without a Privy app id, verifier unregistered, supply side is demo (all 5 tasks funded by the deployer, which `/hub` says plainly). |
| Cold-judge usability (extra) | 4 | 7 | Before: a clone had no run to open (runs live in a gitignored database), so `/run/<hash>` was a 404 and the "Integrity verified" proof was unreachable. After: `pnpm seed:proof`. |

## 1. Claims audit

Verified live on Arc testnet: USDC escrow, payout and gas (one tx pays the operator, 509,221 gas = 0.0127 USDC), finality
strip (blocks read live), x402 purchase with EIP-3009 settlement, SalesLog with the sha256 served, 10 deployed contracts,
`/api/health` green against the public chain.

| Claim (where) | Reality | Fix |
|---|---|---|
| "Testnet deploy pending; everything ran on a fork" (README) | Stale: deployed and run live | Rewrote Status, added the testnet proof scope |
| Verifier "is an agent in Arc's Identity Registry"; "an ERC-8004 agent with a public reputation" (`/arc`, landing FAQ, `/thenar`, `/network`, verifier.json) | False on testnet: `agentId` null, `bound` false, 0 verdicts written | Reworded everywhere to "can be / not registered yet"; label Fork |
| "A paid run needs a person behind the address: a passkey checked on chain" (FAQ, `/thenar`) | The verifier gates on admission; no passkey was registered on testnet, the proof admitted the operator through the issuer | Reworded; passkeys labelled Fork, new `/arc` row |
| "Withdraw ... whenever you like with CCTP" (FAQ, landing, `/thenar`, `/portfolio`) | Burn ran on a fork; attestation and mint never ran | Reworded, status note on `/portfolio` |
| "Sponsors fund tasks from any chain through Gateway; buyers on Base license over CCIP" (FAQ, landing, `/thenar`) | CCIP: Chainlink Local + fork. Gateway: never run, off by default | Reworded; Gateway labelled Not run; CCIP Fork |
| Memo "every payout is submitted through it" (`/network`) | Testnet proof used a relayer, no Memo tag | Reworded; live cell says scripted runs were not tagged |
| "A policy trained on it is minted"; nav "Models trained on the data" (`/foundry`) | Minting trains nothing; no model trained on Arc data | Reworded; nav says "Policy foundry" |
| README "No trained policy exists" | A tiny behaviour-cloned policy ships for practice mode | Stated exactly |
| `.env.example` RPC `rpc.testnet.arc.network` | Wrong host | `rpc.testnet.arc.io` |
| No mention that there is no hosted demo | True | Stated in README and SUBMISSION |

Verifier registration: nothing in README, SUBMISSION, JUDGE-WALKTHROUGH, the app or the agent card now claims it
(`grep` for "registered" checked; the registration file says "once registered and bound").

## 2. Mocks audit

grep of `app/`, `components/`, `lib/` for mock, stub, fake, placeholder, lorem, TODO, sample/demo data: only input
`placeholder=` attributes, "simulated arm" copy (true and disclosed), and doc comments. No stubbed responses, no
hard-coded chain numbers (every figure on `/hub`, `/network`, `/arc` is read from the chain). `/hub` states that all 5 tasks
were funded by the deployer and that no third party has funded one. Optional features default off: the race ghost arm
(`useState(false)`) and Gateway (`NEXT_PUBLIC_FEATURE_GATEWAY` unset; Dockerfile ARG 0).

## 3. Screens audit (production build against Arc testnet, Playwright)

Routes: `/`, `/labs`, `/thenar`, `/start`, `/hub`, `/station/0`, `/post`, `/portfolio`, `/leaderboard`, `/passkey`,
`/corpus`, `/agents`, `/corpus-token`, `/foundry`, `/spec/so101`, `/arc`, `/network`, `/contracts`, `/status`,
`/run/<hash>`, `/task/0`, `/changelog`, plus a 404, each at 1440x900 and 390x844. Result: all 200 (the two 404s are
expected), 0 console errors, 0 failed requests, 0 horizontal overflow, 0 broken images, no
Monad/MON/AUSD/lorem/undefined/NaN text, every explorer link on `explorer.testnet.arc.io`. Screenshots:
`docs/screens/testnet/` (24 desktop, 4 mobile). One server only (port 9011), stopped by PID.

What a cold judge sees without sign-in: the banner and the sign-in button both say "unavailable" (no Privy app id is in
`.env.local`, contrary to the brief's assumption, and none ships). Browsing, `/hub` (live escrow), `/station/0` (practice
scoring) and the read-only pages work. Fixes: the banner now links the recorded payout transaction and `/arc`; `pnpm seed:proof`
loads the two testnet-paid runs (each tx re-checked on chain first; verified from an empty database) so `/run/<hash>` shows the
replay and "Integrity verified"; `/run/<paying tx>` redirects to the run. The walkthrough leads with this path.

## 4. Feature check

Reused `docs/E2E-TESTNET.md` (explorer links all still resolve: tx status success, explorer returns 200). Added the gas figures
and the seed path. Not exercised, and now said so: browser sign-in, passkey registration, Memo tag, ERC-8004, CCTP, CCIP, Gateway.

## What is still weak

1. No hosted demo URL; a judge has to run it locally. Highest-value remaining item.
2. No browser-driven paid run on testnet (needs a Privy app id with the origin allowed).
3. ERC-8004 verifier registration (permanent bind, should be done once with the production origin).
4. Cross-chain legs (CCTP mint, CCIP, Gateway) have never run live.
5. Demand side is seeded by the deployer; the facilitator and relayer are Thenar's own.
