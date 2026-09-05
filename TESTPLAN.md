# Axon — test plan

**Result: 56 PASS, 1 untestable. Executed against the live deployment.**

Seven defects were found and fixed during the run:

1. The payload never reset between runs, so a second run began already inside
   the goal. The scene reset lived in an effect keyed on a module constant, and
   props do not reliably re-run effects inside the react-three-fiber root — the
   rig is now keyed on a per-run id.
2. The leaderboard under-reported by 40%: one `eth_call` per trajectory against
   a 15/sec RPC cap, with failures silently filtered away. Now batched through
   Multicall3, and a partial read raises instead of rendering short.
3. `GET /api/dataset` with no `taskId` exported task 0, because `Number(null)`
   is 0.
4. An unreadable task id flickered between its error state and a spinner
   forever, because the query kept polling a read that always reverts.
5. The post form showed its validation message but left the button enabled.
6. `scripts/claim.mjs` never linked its transaction, so a run that had settled
   on chain reported as never submitted.
7. DESIGN.md still documented the pre-rebrand palette, so every shipped colour
   read as drift.

A fabricated transaction hash was also written to the production database
during the run while backfilling from a truncated log line; it was found,
replaced with the real hash read from the chain, and `scripts/audit-links.mjs`
now holds the store and the chain to each other so it cannot recur.

Target: the live deployment at `https://web-production-2d1d0.up.railway.app`
against `AxonProtocol` at `0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F`
(Monad Testnet, chain 10143).

A pass means the observed result matches the **Correct** column exactly, with a
clean console and no failed network requests. Anything less is a fail.

---

## Pages

| # | Item | Correct means |
| --- | --- | --- |
| P1 | `/` landing | 200. Headline renders in Hanken Grotesk. AXON-6 renders in the hero canvas at full panel size (not 300×150) and runs its pick-and-place cycle. Live figures read from chain: tasks, trajectories recorded, policies minted, open slots, escrowed MON. Contract line links to the explorer. Console clean. |
| P2 | `/hub` | 200. Task table lists every task the contract reports, with id, instruction, difficulty squares, stage track, slot tally, par, escrow, per-run reward. Header strip totals match the sum of the listed rows. Block number in nav ticks. Console clean. |
| P3 | `/hub` filters | Scenario chips filter the list; sort chips reorder it; search narrows by instruction text and by task id. "Accepting runs" hides filled tasks; "Every task" shows them. Counts in the header strip update to match the filtered set. |
| P4 | `/station/[id]` | 200. Reads that task from chain (name, scenario, difficulty, per-run reward, slots left, escrow). 3D viewport fills its cell. Controls legend present. "Begin run" visible. Console clean. |
| P5 | `/portfolio` disconnected | 200. Shows the connect prompt, not an empty table or an error. |
| P6 | `/leaderboard` | 200. Ranks every address that has been paid, read from the trajectory ledger. Totals (operators, runs, paid out) equal the sum of the rows. |
| P7 | `/foundry` | 200. Lists every minted policy with its trajectory count, contributor count, licences sold and fee. Cap table bars are proportional to weight and the percentages sum to ~100%. Filled-but-unminted tasks appear in a "ready to mint" section. |
| P8 | `/task/[id]` | 200. Chain state for that task plus every recorded submission with score, deviation and duration, and a score distribution histogram. Links to each run's verification page. |
| P9 | `/run/[hash]` | 200. Shows the trajectory's score, deviation, duration and sample count; re-hashes the stored samples and reports INTEGRITY VERIFIED; draws the tool path; the scrub control moves the trace head. |
| P10 | `/spec` | 200. Every figure is generated from `cad/arm.py` — reach, height, link table, joint chain, 21 parts, 8080 triangles, 21/21 closed surfaces. |
| P11 | `/post` | 200. Form renders with instruction, slots, reward, scenario, difficulty. Escrow total = slots × reward, live. |
| P12 | 404 | An unknown path renders the in-world 404, not a stack trace. |

## API

| # | Item | Correct means |
| --- | --- | --- |
| A1 | `GET /api/contract` | 200 JSON. `deployed: true`, the real address, chain 10143, verifier address, full ABI array. |
| A2 | `GET /api/health` | 200 JSON, `ok: true`, all five checks true: verifierKey, contract, database, rpc, verifierMatches. |
| A3 | `GET /api/feed` | 200 JSON. `total` equals the row count in the production database; each run carries its hash, task, score and tx. |
| A4 | `GET /api/trajectory/[hash]` | 200 JSON with samples, parts, and `integrity.matches: true`. |
| A5 | `GET /api/trajectory/[bad]` | 404 JSON with a readable error, not a crash. |
| A6 | `GET /api/task/[id]/runs` | 200 JSON listing that task's stored submissions. |
| A7 | `GET /api/dataset?taskId=N` | 200 JSON, LIBERO-shaped, `content-disposition: attachment`, episode count and frame count matching the stored runs. |
| A8 | `GET /api/dataset` (no id) | 400 JSON with a readable error. |
| A9 | `POST /api/verify` valid | 200 JSON with a 32-byte trajHash, a 65-byte signature, a score, and `accepted: true`. |
| A10 | `POST /api/verify` malformed samples | 400 JSON naming the problem. Never 500. |
| A11 | `POST /api/verify` bad address | 400 JSON naming the problem. |
| A12 | `POST /api/verify` filled task | 409 JSON saying the task has no slots left. |
| A13 | `POST /api/submitted` bad hash | 400 JSON, no database write. |

## Contract, on chain

| # | Item | Correct means |
| --- | --- | --- |
| C1 | `createTask` | A real transaction escrows slots × reward; `taskCount` increments; the task reads back with the values sent. |
| C2 | `submitTrajectory` | One transaction records the run and pays the operator. Escrow falls by exactly the payout; operator balance rises by exactly the payout net of gas; slot count advances. |
| C3 | `mintPolicy` | Snapshots a cap table whose weights sum to 10000 bps. |
| C4 | `licensePolicy` | One transaction pays every contributor pro-rata; every wei of the fee leaves the contract. |
| C5 | `claim` | A payee that refuses transfers is credited rather than reverting the submission, and can pull the balance later. |
| C6 | Replay refused | Submitting the same trajectory hash twice reverts `AlreadySubmitted`. |
| C7 | Forged score refused | Submitting a score the verifier did not sign reverts `BadSignature`. |

## Flows

| # | Item | Correct means |
| --- | --- | --- |
| F1 | Full run, no wallet | Begin run → drive → grasp → traverse → release → measurement fires only after a real grasp, verdict and score appear, CTA reads "Connect a wallet to get paid". |
| F2 | Idle run | Beginning a run and touching nothing for 3 s produces **no** verdict. |
| F3 | End run escape | "End run" during a run produces a measurement immediately. |
| F4 | Failed run | Releasing the payload far from the datum gives OUT OF TOLERANCE and a payout of nothing, with copy saying nothing was deducted. |
| F5 | Run again | "Run again" resets the timer, the arm and the payload to their start state. |
| F6 | Hub → station → hub | Navigation works in both directions with no full reload error. |
| F7 | Verify a run | From portfolio or task page, the run link opens `/run/[hash]` and integrity verifies. |
| F8 | Dataset download | `/api/dataset` returns a file whose episode count equals the task's stored runs. |

## Edge cases

| # | Item | Correct means |
| --- | --- | --- |
| E1 | Station, unknown task id | Renders "Could not read that task", not a crash. |
| E2 | Station, non-numeric id | Renders "No such task". |
| E3 | Task page, unknown id | Renders "No such task". |
| E4 | Run page, unknown hash | Renders "No trajectory with that hash". |
| E5 | Hub, filters matching nothing | Renders the empty state with a working "Clear filters". |
| E6 | Post, empty instruction | Submit disabled; inline message explains the minimum. |
| E7 | Post, zero slots | Submit disabled; inline message. |
| E8 | Post, reward above balance | Submit disabled; message says the escrow exceeds the wallet. |
| E9 | Foundry, no policies | Would render an empty state (not applicable while policies exist — assert the populated state instead). |
| E10 | Leaderboard highlights self | A connected address is marked "you" in the standings. |
| E11 | Reduced motion | The hero arm holds a legible pose rather than animating. |
| E12 | Mobile 375×812 | Nav does not overlap; hub filters scroll horizontally; station stacks into one scrolling page. |

## Global

| # | Item | Correct means |
| --- | --- | --- |
| G1 | Console | Zero errors on every page above. |
| G2 | Network | Zero failed requests (4xx/5xx) on every page above, other than the deliberate negative tests. |
| G3 | No mocks | Zero mock/stub/fake/placeholder/TODO in shipped code. |
| G4 | Design detector | `impeccable detect` clean on every route and the source tree. |
| G5 | Types and lint | `tsc --noEmit` and `eslint` clean. |
