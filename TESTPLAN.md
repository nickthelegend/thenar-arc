# Test plan — Thenar on Avalanche Fuji

Every item states what *correct* means as a specific observable result. An item
passes only when the running product at https://thenar.io produces exactly
that, with a clean console and no failed request. Tested against the deployment,
not the source.

| | |
|---|---|
| Chain | Avalanche Fuji, 43113 |
| AxonProtocol | `0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3` |
| PasskeyRegistry | `0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F` |
| Frontend | Vercel · API + SQLite volume | Railway |

---

## A — Pages

| # | Item | Correct means |
|---|---|---|
| A1 | `/` renders | Hero, the 16-prop strip with live 3D previews, network stats read from chain |
| A2 | `/hub` | 8 tasks listed with slots, reward and escrow read from the contract |
| A3 | `/post` | Two prop pickers with 3D previews, instruction composed from the picks |
| A4 | `/spec` | Protocol spec renders |
| A5 | `/foundry` | Policy market; the minted policy is listed with its cap table |
| A6 | `/leaderboard` | Operators ranked by paid total, read from chain |
| A7 | `/portfolio` | Connected-wallet run history; sensible empty state when disconnected |
| A8 | `/task/0` | Task detail: instruction, reward, slots, escrow, difficulty |
| A9 | `/station/0` | Brief, controls, 3D viewport, Begin control |
| A10 | `/run/<hash>` | A settled run's detail with its transaction |
| A11 | Unknown route | `/nonsense` returns 404, not a soft 200 |
| A12 | Every page | Exactly one `<h1>`, nav present, zero console errors |

## B — API

| # | Item | Correct means |
|---|---|---|
| B1 | `GET /api/health` | `ok: true`; all six checks pass |
| B2 | `GET /api/contract` | chain 43113, AVAX, the live address, an ABI |
| B3 | `GET /api/feed` | Settled runs, newest first, with real hashes |
| B4 | `GET /api/props` | The uploaded prop list |
| B5 | `GET /api/props/<id>` | The GLB, `model/gltf-binary`, byte-identical |
| B6 | `POST /api/props` valid | 201 with an id; the file round-trips |
| B7 | `POST /api/props` not a GLB | 415, "not a GLB — missing the glTF magic" |
| B8 | `POST /api/props` bad wallet | 400, "a wallet address is required" |
| B9 | `POST /api/props` duplicate | Returns the first prop, `deduplicated: true` |
| B10 | `POST /api/verify` valid | A signed score, a cid, a trajHash |
| B11 | `POST /api/verify` no duration | 400, "durationSeconds is required" |
| B12 | `POST /api/verify` short run | Refused: "run too short to score" |
| B13 | `POST /api/verify` backwards time | Refused: sample goes backwards |
| B14 | `GET /api/trajectory/<hash>` | The stored samples for a real hash |
| B15 | `GET /api/task/0/runs` | Runs recorded against task 0 |
| B16 | `GET /api/dataset` | A corpus export |
| B17 | `POST /api/submitted` | Marks a run settled; feed count increases |
| B18 | `GET` on a POST-only route | 405 |

## C — On-chain

| # | Item | Correct means |
|---|---|---|
| C1 | Contracts deployed | Non-empty bytecode at both addresses |
| C2 | Source verified | Sourcify `exact_match` for all 6 contracts on 43113 |
| C3 | `createTask` escrows | Escrow equals slots × reward |
| C4 | `submitTrajectory` pays | Contract balance falls by the reward in the same tx |
| C5 | Replay refused | Submitting the same trajHash twice reverts `AlreadySubmitted` |
| C6 | Unsigned score refused | A score without the verifier signature reverts `BadSignature` |
| C7 | Five-run cap | A sixth run by one account on one task reverts `CapReached` |
| C8 | `mintPolicy` needs a full task | Minting an unfilled task reverts `NotFilled` |
| C9 | `licensePolicy` fans out | Every contributor's balance rises pro-rata in one tx |
| C10 | Wrong fee refused | A licence with the wrong value reverts `WrongFee` |
| C11 | Sharded counters | `slotsFilledOf` equals the sum of shards |
| C12 | PasskeyRegistry verifies | Real secp256r1 signature returns 1, tampered returns 0 |

## D — Flows

| # | Item | Correct means |
|---|---|---|
| D1 | Task → station | A task on `/hub` opens its station with the right instruction |
| D2 | Scene matches instruction | The station loads the GLBs the instruction names |
| D3 | Begin a run | Timer starts, controls enable |
| D4 | Record and score | A driven run produces placement, smoothness and efficiency |
| D5 | Submit → pay | The score is signed, the tx settles, the operator is paid |
| D6 | Run appears in the feed | The settled run shows on `/` and `/leaderboard` |
| D7 | Upload → pick | An uploaded model can be selected when posting a task |
| D8 | Wallet disconnected | Every write path prompts to connect rather than failing |

## E — Cross-cutting

| # | Item | Correct means |
|---|---|---|
| E1 | Zero console errors | No page logs an error or unhandled rejection |
| E2 | Zero failed requests | No 4xx/5xx subresource anywhere |
| E3 | Mobile 375px | No horizontal overflow; nav reachable |
| E4 | No mocks | Zero mock/stub/TODO/fake hits in source |
| E5 | Persisted DB | Row counts survive a redeploy |
| E6 | Right chain everywhere | No Monad references; faucet points at Avalanche |
