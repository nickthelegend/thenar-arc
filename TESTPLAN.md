# Thenar — test plan

Target: the deployed product at **https://thenar.io** (frontend, Vercel), whose
`/api/*` is proxied to **https://thenar.io** (backend
and SQLite volume, Railway), against **AxonProtocol** at
`0x89384f46e430F37DB61Afb98810eba995C0d6Ed4` on Monad Testnet (chain 10143).

A pass means the observed result matches the **Correct means** column exactly,
with a clean console and no failed network requests. Close, mostly-working, or
"the button did something" is a fail.

## Pages

| # | Item | Correct means |
| --- | --- | --- |
| P1 | `/` landing | 200. Wordmark reads THENAR. Live chain figures: tasks, trajectories, policies, open slots, escrowed MON — all non-zero and equal to the contract. Contract line links to the explorer. Control copy describes drag/WASD/EQ, not the old arrows/E-D. Footer reads THENAR. |
| P2 | `/hub` | 200. Header totals equal the sum of the listed rows. Every task the contract reports is listed with id, instruction, difficulty, stage, slots, par, escrow, per-run reward. Block number ticks. |
| P3 | `/hub` filters | Scenario chips filter; sort chips reorder; search narrows by instruction and by task id; "Accepting runs" hides filled tasks and "Every task" shows them; header counts follow the filtered set. |
| P4 | `/station/[id]` | 200. Task read from chain. 3D viewport fills its cell and renders the arm. Controls legend lists Drag / W S / A D / E Q / Space. "Begin run" present. |
| P5 | `/portfolio` disconnected | 200. Connect prompt, not an empty table or an error. |
| P6 | `/leaderboard` | 200. Every paid address ranked from the trajectory ledger; operators/runs/paid-out totals equal the sum of the rows. |
| P7 | `/foundry` | 200. Every minted policy with trajectories, contributors, licences sold and fee. Cap-table bars proportional, percentages sum to ~100%. |
| P8 | `/task/[id]` | 200. Chain state plus every **settled** submission with score, deviation, duration, and a score histogram. Submission count equals the chain's filled slots. |
| P9 | `/run/[hash]` | 200. Score, deviation, duration, sample count; re-hashes stored samples and reports INTEGRITY VERIFIED; draws the tool path; scrub moves the trace head. |
| P10 | `/spec` | 200. Every figure generated from `cad/arm.py` — reach, height, link table, joint chain, 21 parts, 8080 triangles. |
| P11 | `/post` | 200. Form renders with instruction, slots, reward, scenario, difficulty. Escrow total = slots x reward, live. |
| P12 | 404 | Unknown path renders the in-world 404, not a stack trace. |
| P13 | `/passkey` | 404. The passkey surface was removed on request; the route must be gone, not broken. |

## API

| # | Item | Correct means |
| --- | --- | --- |
| A1 | `GET /api/contract` | 200 JSON. `deployed: true`, real address, chain id 10143, verifier address, full ABI array. |
| A2 | `GET /api/health` | 200 JSON, `ok: true`, all six checks true, including `signingDomain` matching the contract's own `domainSeparator()`. |
| A3 | `GET /api/feed` | 200 JSON. `total` equals the chain's `trajectoryCount()` — settled rows only. |
| A4 | `GET /api/trajectory/[hash]` | 200 JSON with samples, parts, and `integrity.matches: true`. |
| A5 | `GET /api/trajectory/[bad]` | 404 JSON with a readable error, not a crash. |
| A6 | `GET /api/task/[id]/runs` | 200 JSON; row count equals the chain's filled slots for that task. |
| A7 | `GET /api/dataset?taskId=N` | 200 JSON, LIBERO-shaped, `content-disposition: attachment`. |
| A8 | `GET /api/dataset` (no id) | 400 JSON with a readable error. |
| A9 | `POST /api/verify` valid | 200 JSON: 32-byte trajHash, 65-byte signature, score, `accepted: true`. |
| A10 | `POST /api/verify` malformed samples | 400 JSON naming the problem. Never 500. |
| A11 | `POST /api/verify` bad address | 400 JSON naming the problem. |
| A12 | `POST /api/verify` filled task | 409 JSON saying the task has no slots left. |
| A13 | `POST /api/submitted` bad hash | 400 JSON, no write. |
| A14 | `POST /api/submitted` unknown tx | 409 JSON. A hash that is not on chain must never be recorded. |
| A15 | `POST /api/submitted` reverted tx | 409 JSON. A reverted transaction must never be recorded as settled. |
| A16 | `POST /api/reconcile` | 200 JSON. Holds the ledger to the chain; running it twice changes nothing. |

## Contract, on chain

| # | Item | Correct means |
| --- | --- | --- |
| C1 | `createTask` | Escrows slots x reward; `taskCount` increments; contract balance rises by exactly the escrow. |
| C2 | `submitTrajectory` | Records and pays in one transaction. Escrow falls by `reward x score / 10000`; operator rises by that net of gas. |
| C3 | `mintPolicy` | Snapshots a cap table whose weights sum to 100% within integer-division dust. |
| C4 | `licensePolicy` | One transaction pays every contributor their exact cap-table share; fee net of the 2.5% protocol take. |
| C5 | `claim` | A payee that refuses transfers is credited rather than reverting the sale, and can pull later. |
| C6 | Replay refused | The same trajectory hash twice reverts `AlreadySubmitted`. |
| C7 | Forged score refused | A score the verifier did not sign reverts `BadSignature`. |
| C8 | Sharded counters | A task still fills exactly, with no lost or double-counted slot, under sharded writes. |
| C9 | Verification | AxonProtocol reports `exact_match` on the explorer. |

## Flows

| # | Item | Correct means |
| --- | --- | --- |
| F1 | Full run, no wallet | Begin run, drive, grasp, traverse, release; measurement fires only after a real grasp; verdict and score appear; CTA asks for a wallet. |
| F2 | Idle run | Beginning a run and touching nothing produces no verdict. |
| F3 | End run escape | "End run" during a run produces a measurement immediately. |
| F4 | Failed run | Releasing far from the datum gives OUT OF TOLERANCE, pays nothing, and says nothing was deducted. |
| F5 | Run again | Resets timer, arm and payload to their start state. |
| F6 | Navigation | Hub to station and back, no reload error. |
| F7 | Verify a run | Task page run link opens `/run/[hash]` and integrity verifies. |
| F8 | Wallet connect | The nav Connect opens the RainbowKit modal, which lists real connectors and closes again. |
| F9 | Frontend/backend split | A write through thenar.io reaches the Railway database and is visible from both origins. |

## Edge cases

| # | Item | Correct means |
| --- | --- | --- |
| E1 | Station, unknown task id | "Could not read that task", not a crash. |
| E2 | Station, non-numeric id | "No such task". |
| E3 | Task page, unknown id | "No such task". |
| E4 | Run page, unknown hash | "No trajectory with that hash" empty state. |
| E5 | Hub, filters matching nothing | Empty state with a working "Clear filters". |
| E6 | Post, empty instruction | Submit disabled with an inline message. |
| E7 | Reduced motion | The hero arm holds a legible pose rather than animating. |
| E8 | Mobile 375x812 | Nav does not overlap; hub filters scroll; station stacks. |
| E9 | Ledger vs chain | Stored settled runs equal the chain's trajectory count, per task and overall. |

## Global

| # | Item | Correct means |
| --- | --- | --- |
| G1 | Console | Zero errors on every page above. |
| G2 | Network | Zero failed requests other than the deliberate negative tests. |
| G3 | No mocks | Zero mock/stub/fake/placeholder/TODO in shipped code. |
| G4 | Types and lint | `tsc --noEmit` and `eslint` clean. |
| G5 | Contract tests | The Foundry suite passes in full. |
| G6 | SEO artifacts | `robots.txt`, `sitemap.xml`, `manifest.webmanifest` serve 200; sitemap has no dead route. |
| G7 | Secrets | No private key in the repo or in the Vercel upload. |
