# Full-surface test plan: Thenar on Monad

Target: the app served locally from this repository (`next dev --port 3333`),
driven through Claude in Chrome, against the **live Monad testnet deployment**
in `lib/deployment.ts` (chain 10143) and a real persisted SQLite store at
`.data/axon.db`. 27 pages, 45 API routes, 12 contracts.

Every item states the exact expected result. A pass requires the real result
to match it **and** a clean console and network tab for that item — an
expected refusal (a 400 the item asks for) is the only non-2xx allowed, and
only on the request the item is about.

Seed state after `DeployMonad.s.sol`: five tasks, ids 0–4, each 6 slots at
0.002 MON per full-score run (0.012 MON escrowed each); task 4 carries a
deadline seven days out; no trajectories, no policies.

---

## A. Pages

| # | Surface | Correct means |
|---|---|---|
| A1 | `/` | Hero renders; the chain line names Monad Testnet · chain 10143; live figures equal `/api/stats` |
| A2 | `/hub` | "Every Task" lists exactly `taskCount()` tasks; escrow total equals the sum of `getTask(i).escrow`; amounts in MON; filters narrow the list |
| A3 | `/task/0` | Name, reward, slots and escrow equal `getTask(0)`; history panel states its source or the missing key |
| A4 | `/task/999`, `/task/abc` | 404 status with the custom page |
| A5 | `/station/0` | Scene mounts; practice run drives the arm; deviation updates; no wallet → practice with a reason |
| A6 | `/run/<hash>` of a settled run | Integrity verified in the browser; the transaction link is `testnet.monadscan.com/tx/<the run's tx>` |
| A7 | `/run/0xdeadbeef` | 404 |
| A8 | `/leaderboard` | Every contributor from `trajectoryCount()`/`getTrajectory`, totals equal the chain |
| A9 | `/operator/<addr>` | That address's runs from the chain; call-history panel names Monadscan or the missing key |
| A10 | `/portfolio` | Clear connect prompt with no wallet |
| A11 | `/contracts` | Exactly the 12 deployed contracts, each with non-zero code size read live; Monad notes on AxonProtocolV2, SalesLog, PasskeyRegistry; Blitz v1 and Fuji v2 under Superseded |
| A12 | `/agents` | Terms: 0.01 USDC, `eip155:10143`, the facilitator, paid-to address, SalesLog address linked to Monadscan; ledger matches `/api/agent/sales` |
| A13 | `/corpus-token` | Name "Thenar Robot Corpus (THNRC)", supply/holders/dividends equal the contract; holder lookup: non-address → hint on blur, unlisted address → "refuses… AccountIsNotInControlList" |
| A14 | `/lab` | Wallet address and MON balance from chain; policy read back from Privy showing chain 10143, the Axon address and a 0.1 MON ceiling |
| A15 | `/corpus` | Episode index; outcome filters agree with labels; subscription panel reads `pricePerDay` from CorpusAccess |
| A16 | `/foundry` | Treasury balance equals the Foundry contract's balance; proposal count equals `proposalCount()` |
| A17 | `/policies` | Board renders; empty state stated when no policy exists |
| A18 | `/licence/0` with no policy | A stated "no such policy", not a crash |
| A19 | `/archive` | Blitz and Fuji deployments, labelled as superseded |
| A20 | `/status` | Every health check with its real state; a failing check shows FAIL with its reason |
| A21 | `/passkey` | Registry address is the deployed one; states browser/wallet state |
| A22 | `/post` | Composer; asks for a wallet; quotes observed cost or says none observed yet |
| A23 | `/spec`, `/changelog`, `/inventory`, `/space`, `/handheld`, `/offline` | Render with no errors; changelog lists this repo's commits |
| A24 | `/definitely-not-a-page` | 404 with the custom page |

## B. API

| # | Route | Correct means |
|---|---|---|
| B1 | `GET /api/health` | Contract check names the deployed Axon; verifier check matches `verifier()`; 503 while any check fails, with the failing one named |
| B2 | `GET /api/contract` | Axon address and chain 10143; 12 contracts, each address equal to `lib/deployment.ts` |
| B3 | `GET /api/feed` | Settled runs of this deployment only |
| B4 | `GET /api/stats` | Counts, no identifiers |
| B5 | `GET /api/archive` | Superseded-deployment runs only |
| B6 | `GET /api/corpus` (+ `outcome=paid|failed|unsubmitted`, `outcome=bogus`, `taskId=abc`) | Partitions add up; bad values 400 |
| B7 | `GET /api/openapi`, `GET /api` | Index and document; every documented path answers a documented status |
| B8 | `GET /api/policy`; `POST` malformed | Board; 400 naming the field |
| B9 | `GET /api/task/0/{runs,attempts,manifest,datasheet,paths,notes,team}` | 200 with real (possibly empty) content; `datasheet` for a task with no runs is the documented 404 "no runs recorded"; `abc` variants 400 |
| B10 | `GET /api/task/0/history?funder=<deployer>` | 200 from Monadscan, or 503 naming `ETHERSCAN_API_KEY`; no funder → 400 |
| B11 | `GET /api/calls/<addr>`, `/api/calls/nope` | 200/503 as B10; 400 |
| B12 | `GET /api/trajectory/<hash>` (+ `/similar`, `/annotation`); `0xdeadbeef` | 200; 404 |
| B13 | `POST /api/trajectory/<hash>/annotation` unsigned / wrong author | 401 / 403, nothing stored |
| B14 | `GET /api/physics/<hash>` | Re-check result for a stored run |
| B15 | `GET /api/props`, `/api/props/u_missing`, `/api/space`, `/api/space/abc` | 200, 404, 200, 400 |
| B16 | `GET /api/dataset` no args / `taskId=0` without access / `traj=<hash>` | 400 / 402 naming CorpusAccess / 200 |
| B17 | `GET /api/dataset/summary` without taskId / with | 400 / 200 |
| B18 | `GET /api/snapshot`, `/api/snapshot/drill` | Real bucket metadata; with no bucket configured, 503 on both with the reason stated (not 502, which means the store refused) |
| B19 | `GET /api/reconcile` | Ledger vs chain for this deployment |
| B20 | `GET /api/sign` | `holdsKey: true`, verifier equals `VERIFIER_ADDRESS` (no SIGNER_ORIGIN locally) |
| B21 | `GET /api/notify` | VAPID key, or a stated missing configuration |
| B22 | `POST /api/hit` with a run path | 200 `counted: true` |
| B23 | `POST /api/verify` empty / duplicate route | 400 / 409 naming the duplicate |
| B24 | `GET /api/submitted`, `/api/migrate` | 405 |
| B25 | `GET /api/agent/corpus` no taskId / `taskId=abc` / `taskId=0` | 400 / 400 / 402 whose JSON body carries `accepts[0]`: scheme exact, network eip155:10143, asset USDC, amount 10000, payTo the treasury, and the AgentKit extension |
| B26 | `GET /api/agent/sales` | Terms equal `AGENT_CORPUS`; `salesLog` the deployed address |
| B27 | `GET /api/agent/status?address=<agent>` / `?address=nope` | AgentBook answer from World Chain / 400 |
| B28 | `GET /api/tokenize` / `?address=<unlisted>` / `?address=nope` | Shares from chain / compliance refusal `AccountIsNotInControlList` / 400 |
| B29 | `GET /api/lab` / `POST` malformed | Wallet, balance, policy from Privy / 400 |
| B30 | `POST /api/world/verify` malformed; `GET /api/world/request` | 400; a signed request or a stated missing config |

## C. On-chain

| # | Item | Correct means |
|---|---|---|
| C1 | Every address in `lib/deployment.ts` | Has code on chain 10143 |
| C2 | Seed | `taskCount() == 5`, each `rewardPerTrajectory == 0.002 MON`, `slotsTotal == 6` |
| C3 | Verifier | `verifier()` equals `VERIFIER_ADDRESS`; CorpusManifest verifier the same |
| C4 | Issuer | `CorpusShares.issuer()` and `SalesLog.seller()` equal `CORPUS_ISSUER_ADDRESS` |
| C5 | Source verification | Every contract verified on Sourcify for chain 10143 |
| C6 | `atBlock` / `createdBlock` | A settled run's `atBlock` is its receipt's block; a one-block getLogs there returns its tx |

## D. External integrations

| # | Integration | Correct means |
|---|---|---|
| D1 | Monad RPCs | All three endpoints answer; the fallback reads survive a dead primary |
| D2 | Monadscan (Etherscan V2) | Real txlist, or untested with the missing key stated |
| D3 | SQLite | Rows persist across a server restart |
| D4 | Privy | Policy and wallet read back from Privy's API |
| D5 | World Chain AgentBook | Real lookup |
| D6 | Monad x402 facilitator | `/supported` lists eip155:10143 exact; a real settle |
| D7 | Snapshot bucket, web push | Real, or untested with the missing credential stated |

## E. Flows

| # | Flow | Correct means |
|---|---|---|
| E1 | Scripted run: verify → submit → record → read back | Real score and signature; a Monad tx paying MON in the receipt; appears in `/api/feed`, `/hub` activity, `/run/<hash>`, `/leaderboard` with its tx link |
| E2 | Duplicate refused | Replaying the same route: 409 before any transaction |
| E3 | Lab bounty from the page | Privy signs, Monad receipt success, a new task appears on `/hub` funded by the lab wallet |
| E4 | Lab policy refusal from the page | "Privy refused" with `policy_violation`; no transaction |
| E5 | Agent buys a corpus (paid) | 402 → USDC authorisation → 200; settlement tx on Monad; SalesLog entry with the file's sha256; `servedCount` ≥ 1; row on `/agents` |
| E6 | Agent free pull (AgentKit) | Needs the agent registered in AgentBook with World App |
| E7 | Selfie Check → whitelist → shares | Needs World App on a phone |
| E8 | Dividend | `shares.mjs dividend 0.01` settles; `/corpus-token` shows one more dividend |
| E9 | Operator run through the station with a wallet | Needs a signed-in Privy wallet |
| E10 | Corpus subscription gate | 402 → `subscribe` on chain → 200 for that subscriber |
| E11 | Palette and tour | ⌘K opens; tour steps navigate to live pages |

## F. Cross-cutting

| # | Item | Correct means |
|---|---|---|
| F1 | Console | Zero errors on every page |
| F2 | Network | Zero unexpected 4xx/5xx |
| F3 | Security headers | CSP naming the Monad RPCs and facilitator; nosniff; referrer policy; frame DENY |
| F4 | No Arc/Hedera/Fuji leftovers | No visible text or link naming Arc, Hedera, HashScan or USDC gas on any page |
| F5 | Responsive | 375 px: no horizontal scroll on `/`, `/hub`, `/agents`, `/corpus-token`, `/lab` |
| F6 | No mocks | No stubbed data or fallback fixtures in the tested surface |

---

# Results — first pass and fixes, 23 September 2026

Against the production build of this repository on port 3333, the live Monad
testnet deployment in `lib/deployment.ts`, and Chrome through Claude in
Chrome. Automated totals on the final build: **API 75/75**, **end-to-end
56/56** (3 checks skipped for want of a paid run), **86 unit**, **120
contract** tests.

## Status by item

| Item | Status | Note |
| --- | --- | --- |
| A1–A4, A7, A8, A10–A17, A19–A21, A24 | PASS | A19's expectation corrected: /archive holds stored runs from earlier deployments, and a fresh store has none |
| A9, A18, A22, A23 | PASS after fix | see below |
| A5 | PARTIAL | Scene mounts, practice run starts, "Leave site?" guards a run in progress. Driving the arm is unverified: the automation window reports `visibilityState: hidden` and 0 animation frames a second |
| A6 | BLOCKED | Needs a paid run, which needs a World ID Selfie Check |
| B1–B11, B15–B22, B24–B30 | PASS | B10/B11 pass as the stated 503 for a missing Etherscan key; B21 passes as the stated missing VAPID key |
| B18 | PASS after fix | |
| B12, B13, B14, B16 (by hash), B23 | BLOCKED | Need a stored run |
| C1–C5 | PASS | 12 contracts with code, seeded as specified, verifier and issuer as specified, all `exact_match` on Sourcify (plus the redeployed CorpusShares) |
| C6 | PASS for tasks, BLOCKED for runs | A task's `createdBlock` equals its posting receipt's block and the one-block log query finds it; a run's `atBlock` needs a run |
| D1, D3, D4, D5 | PASS | Dead primary: fallback answered in 458 ms. SQLite rows survive a restart. Privy policy read back. AgentBook `lookupHuman = 0` read from World Chain directly |
| D6 | PARTIAL | Facilitator lists `eip155:10143` exact; a real settle needs agent USDC and a task with runs |
| D2, D7 | UNTESTED | No Etherscan key, no snapshot bucket or VAPID key anywhere in reach; each surface states the missing configuration |
| E3, E8, E11 | PASS after fix | |
| E4 | PASS | Privy `policy_violation`, balance unchanged to the wei |
| E1, E2, E5, E7, E9, E10 | BLOCKED | Every paid run needs a World ID proof; the gate is one row written only by a real proof and is not bypassed for testing |
| E6 | UNTESTED | Needs the agent registered in AgentBook with World App |
| F1–F4, F6 | PASS | Zero console errors and zero failing requests on every page visited |
| F5 | UNTESTED | Needs a visible browser window; the in-app pane blocked same-origin CSS, so its measurements were of an unstyled page |

## What failed, and what fixed it

| Item | Failure | Fix |
| --- | --- | --- |
| B18 | `/api/snapshot` answered 502 for "no bucket configured" | 503 when unconfigured, 502 only when a bucket refuses; documented |
| A9 | `/operator` showed "0 protocol calls, 0 reverted" when the index or ledger failed | A failure is kept apart from an empty list and shown with its reason |
| A9, A3 | Every index page issued a 503 and a console error when no key exists | Build-time flag for whether the key exists; pages state the reason without asking |
| A4, A18 | `/station/999`, `/licence/<unminted>`, `/operator/nope` were 200s saying "not found" | 404s, asked of the contract |
| A22 | `/post` showed "balance 0.0000 MON" with no wallet, projected a shortfall from zero runs, and named "the six tasks here" | Each figure now comes from something measured |
| A3 | "posted with createTask" said of a createTaskUntil task | Said from the task's state |
| A23 | `/changelog` listed the Arc and Hedera commits | Regenerated from this repository; builds run `pnpm build`, which regenerates it |
| A23 | `/handheld` said 408 mm beside a 512 mm spec | Names the solver's reach and reads it from `REACH_MAX` |
| E3 | `/lab` listed its bounties without the one it had just posted | Refetches until the posted task is there (Monad reads can trail the confirming block) |
| E8 | A dividend declared with no shares outstanding could never leave CorpusShares | `reclaimDividend`, three tests, CorpusShares redeployed; declared and reclaimed on chain |
| E8 | The shares page called its log "every write" | "Every write this server made" |
| E11 | The tour dead-ended at step 3 with no paid run | Skips a step with nothing to show, and says so |
| B7 | Three routes answered statuses the OpenAPI document did not list | Documented |
| — | `.env.local` Privy policy name over Privy's 50-character limit | Shortened |

## Remaining to finish the run

The re-run of the page sweep was interrupted when the Chrome extension
stopped answering. Everything BLOCKED above waits on one human step: a
Selfie Check in World App for an operator address, then a run driven at the
station. PARTIAL and F5 need the browser window visible.
