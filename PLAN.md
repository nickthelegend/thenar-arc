# Thenar — build plan

Rewritten 3 Sep 2026, extended the same day with Phase 9, and again on 10 Sep
with Phase 10. Every figure below was read from the live deployment,
Avalanche Fuji, or the source tree on the day of writing — not carried forward
from the previous plan, which had drifted (it named a superseded contract as
current and a database engine the project no longer uses).

| | |
|---|---|
| Live | https://thenar.io — Vercel serves the pages |
| API | Railway `web` service. **`next.config` rewrites every `/api/*` to `BACKEND_ORIGIN`**, so the Vercel deployment does not serve the API |
| Signer | Railway `signer` service, private network, holds `VERIFIER_PRIVATE_KEY`. The web service holds no key |
| Database | Railway Postgres (`DATABASE_URL`). SQLite at `.data/axon.db` is the local-dev engine only |
| Chain | Avalanche Fuji, 43113 |
| On chain now | 6 tasks · 9 trajectories · 1 policy · 0.017447 AVAX escrowed |
| Off chain now | 6 station trajectories stored · 33 archived runs · 3 uploaded props |
| Surface | 24 pages · 37 API routes · 12 deployed contracts |
| Tests | 72 unit · 72 e2e · 108 contract · 38 page checks · a driven run end to end · CI on push, PR and 6-hourly |

**Deploying:** a change to anything under `app/api/` must go to **Railway**, not
just Vercel. Deploying only to Vercel changes nothing about the live API — this
cost half a day once already.

**Deploying, third trap:** ship from a **committed** tree. In a git repository
the Vercel CLI uploads what git knows about, so an untracked file is simply not
there — a new component deployed clean, built successfully, and its panel was
missing from the page. `scripts/ship.mjs` refuses to run on a dirty tree for
this reason.

**Deploying, second trap:** `vercel --prod` will happily reuse a cached build and
report success. A real build of this project compiles in 12–18s; a log saying
`Compiled successfully in 2.3s` means nothing was rebuilt and a new route will
404 on the alias while working on the origin. Use `--force`, and read
`readyState` out of the JSON rather than grepping the output for "ready" — the
word appears in help text, so a grep reports success for a deploy that never ran.

---

## Execution log — 3 Sep 2026

| Phase | Result |
|---|---|
| 0 — Ground truth in the docs | **DONE** |
| 1 — Surface the dark contracts | **DONE**, including 1.9 — Warp payload on `/licence`, soulbound certificate on `/run` |
| 2 — Write-path verification | **DONE except the accepting case.** 2.3, 2.4, 2.5 and 2.6 are executed against the deployed contract with no wallet, via `eth_call` — five checks in section C6. Only 2.1/2.2 remain: a run that is *accepted* has to move AVAX, and no operator key exists here |
| 3 — Physics honesty | **DONE** |
| 4 — What a minted policy is | **DONE** |
| 5 — First-run cost | 5.1 **measured**, 5.2 **documented**; 5.3 scoped with evidence, not built — it needs an Avalanche L1 deployed and validated, which is not a change to this repository |
| 6 — Test and QA | **DONE** |
| 7 — Infrastructure | **DONE** |
| 8 — Presentation | **DONE** |

**Final verification against production**, every runner exiting 0:
23/23 pages · 10/10 deep · 37/37 API · 6/6 POST · 8/8 contracts ·
C1–C5 plus C6.1–C6.5 on chain · 57/57 route×mode · 72/72 e2e · 57 unit ·
108 contract · demo rehearsal 23.1s with zero console errors · detector clean.

**What is not executed, and the real reason for each.**

**2.2 — a signed run accepted.** The check is written and runs on `QA_SIGNED_RUN`.
It needs one genuine recorded run, and a run cannot be manufactured here without
putting a demonstration nobody performed into a corpus sold as human
teleoperation — `/api/verify` persists what it signs, and every archived run
predates `payloadIds`, which are part of the canonical hash. **Anyone who drives
one practice run on the station can close this in a minute:** POST the recording
to `/api/verify`, save the response, set `QA_SIGNED_RUN` to it. 2.1 is dropped —
no wallet is needed, because nothing is sent.

**5.3 — closed.** All three claims are shown against a live L1; see
`docs/l1-proof.txt`. The local network was destroyed afterwards, leaving the
machine as it was found.

**Interrupted mid-run** by the boot volume filling — every shell command,
including `df`, failed with `ENOSPC`. Recovered and continued.

---

## 1. Goals

### What "done" means

A stranger with a browser completes this unaided, and a stranger with money
verifies it afterwards:

1. Land, understand the product, open a task without reading docs.
2. Drive the arm and see the run measured against the datum.
3. Submit and be paid in the transaction that records the trajectory.
4. Open that transaction on a public explorer and see the payout.
5. A buyer licences the corpus; every contributor is paid pro-rata in one call.

All five work today. **Done is not "the loop runs" — done is "every number the
interface shows is true, and everything the project has built is reachable."**
Both halves are currently unmet, and the second is the larger gap: six deployed,
Sourcify-verified contracts have no user-facing surface at all.

### What "winning" means

The project placed 3rd at Monad Blitz Hyderabad V3 and now settles on Avalanche.
Judged on innovation, technical execution, design, usefulness, sponsor
technology and presentation, Thenar wins by being the submission whose claims
survive being checked:

- **W1 — Every rendered figure reconciles with chain state.** A judge who reads a
  number off a page and calls the contract gets the same number.
- **W2 — Nothing is claimed that does not work.** The non-capabilities in
  PRODUCT.md are named in the interface as roadmap wherever a visitor could
  assume otherwise.
- **W3 — The sponsor technology is load-bearing, not decorative.** Avalanche is
  doing something a generic EVM chain could not, and a judge can point at it.
- **W4 — Everything built is reachable.** A contract that is deployed, verified
  and invisible scores nothing and reads as abandoned work.
- **W5 — The demo survives a cold start.** First visit, no wallet, no faucet,
  nothing cached, on a phone.

---

## 2. Phases

Ordered by what unblocks what. Phase 1 is first because six finished contracts
being invisible is the single largest gap between what exists and what a judge
can see.

### Phase 0 — Ground truth in the docs · DONE

The repo's own documents disagree with the deployment.

| Task | State |
|---|---|
| 0.1 README chain claims corrected. Larger than one line: there were **two** "Live deployment" tables and the second presented Monad chain 10143 with monadscan links as current. Also corrected — the Contracts section, the Run it faucet (MON → AVAX on Fuji), and four pieces of architectural rationale that argued from Monad's parallel execution, which Avalanche C-Chain does not have | DONE |
| 0.2 Reconcile README's contract table against on-chain code — all 12 verified present this run, keep it that way | DONE |
| 0.3 Replace the stale PLAN.md (named `0x025dB4…` as current; that is the superseded v1) | DONE — this file |
| 0.4 README "Live endpoints" now states that every `/api/*` is rewritten to the Railway `web` service, so an API change deployed only to Vercel changes nothing | DONE |
| 0.5 The four earlier plans moved to `docs/history/` with an index naming what each covered and pointing at the current pair. Kept, not deleted — they are evidence of what was checked and when | DONE |
| 0.6 README states the directory and remote names are from the original build and are left alone so the history stays traceable | DONE |

### Phase 1 — Surface the six dark contracts · DONE

Deployed, Sourcify `exact_match`, holding balances in two cases, and referenced
by **zero** application files. Each task below is "give it a page or a panel a
visitor can reach from the nav, reading live chain state."

**Live at https://thenar.io/contracts** — 200, eleven deployed contracts plus the
superseded one, every figure a call made at request time.

It took three attempts to get there, and the cause is worth keeping. The page
404'd on the alias while returning 200 on the Railway origin, through a build
that reported success. `.vercelignore` contained `contracts/` **unanchored**,
which matches a directory of that name at any depth — so `app/contracts/` was
silently excluded from the upload. The build was correct about what it received.
All three entries are anchored to the repo root now.

| Task | State |
|---|---|
| 1.1 DONE — **TrajectoryCertificate** `0x7a0601…` — soulbound, names a run's recorder. `NEXT_PUBLIC_TRAJECTORY_CERTIFICATE` is set in env but read by no file. Surface: a certificate panel on `/run/[hash]` showing the token for that run, or an explicit "not minted for this run" | DONE |
| 1.2 DONE — **ContributionRecord** `0xa3b2dd…` — running total of work recorded, in a shape wallets read. Surface: on `/operator/[address]` and `/portfolio`, beside the earned total | DONE |
| 1.3 DONE — **Referrals** `0x50414b…` — holds **0.0025 AVAX**. Pays for bringing someone who then works. Surface: a referral link on `/portfolio` and the claim state | DONE |
| 1.4 DONE — **PrizePool** `0x42912F…` — funded pot for one task, splits by recorded work. Surface: a pool banner on the task it funds, showing the pot and the current split | DONE |
| 1.5 DONE — **Foundry contract** `0xFf4007…` — holds **0.010 AVAX**. A treasury contributors vote to spend. Note: the existing `/foundry` **page** is a policy/cap-table view reading `/api/dataset/summary` and is unrelated to this contract. Surface: a treasury + vote panel, or rename one of the two so the collision is not confusing | DONE |
| 1.6 DONE — **ConfidentialPayouts** `0x8CD8A9…` — ElGamal on secp256k1; earnings add up on chain without the chain holding a number. This is the strongest W3 candidate in the repo. Surface: an opt-in confidential-earnings view on `/portfolio` | DONE |
| 1.7 DONE — **LicenceReceipt** `0xbA65eC…` — emits an Avalanche **Warp** message attesting a policy, signed by Fuji's validators. Second-strongest W3 candidate. Surface: on `/licence/[policyId]`, show the Warp message and its signature | DONE |
| 1.8 `/api/contract` now returns the whole set — name, address, what it does, source and surface, plus the superseded one — alongside the protocol fields it always had, so existing consumers are unaffected. README links the registry | DONE |
| 1.9 **Both panels built.** `/licence/[policyId]` reads `payloadFor` and shows the validator-signed Warp payload, or says plainly that a policy is not attested. `/run/[hash]` resolves the trajectory id from the ledger and shows the soulbound certificate for that run, or that none is minted. Both registry surfaces updated to match | DONE |

### Phase 2 — Close the write-path verification gap · DONE, one assertion awaiting input

The read path is fully verified. The write path is evidenced only by its
outputs (9 paid runs on chain) and has never been exercised end to end in test.

| Task | State |
|---|---|
| 2.1 **No longer required.** It was listed to unblock 2.2, and 2.2 turned out not to need a wallet at all — `eth_call` proves acceptance without sending a transaction. Provisioning a key now would buy nothing | DROPPED — the task it existed for does not need it |
| 2.2 **Wired, and it runs the moment a real recording exists.** `eth_call` does cover this — a submission the contract would accept returns the trajectory id instead of reverting, with nothing sent and nothing written, so no funded key is needed after all. What it needs is a signature the verifier actually produced, and the verifier only signs a run it has scored. C6.6 takes one via `QA_SIGNED_RUN` and asserts it; without one it prints exactly what it wants. **Deliberately not fabricated:** `/api/verify` persists what it signs, and every archived run predates `payloadIds`, which are part of the canonical hash — so a signature cannot be reconstructed without inventing a run that never happened, and putting a demonstration nobody performed into a corpus sold as human teleoperation is worse than an untested assertion | READY — needs one genuine recorded run |
| 2.3 **Done without a wallet.** `RUNS_PER_ACCOUNT` is 5 on the deployed contract and `runsOnTask` reads each operator's count against it — C6.5 | DONE |
| 2.4 **Done without a wallet.** `trajectoryUsed` returns true for a settled hash, and simulating its resubmission reverts — C6.1, C6.2 | DONE |
| 2.5 **Done without a wallet, and it found something.** An unsigned submission reverts `BadSignature` — and so does a replay, and so does a score above `MAX_SCORE`. The contract verifies the verifier's signature *before* any business rule, so a forged submission never reaches them. My assertions expected `AlreadySubmitted` and `ScoreTooHigh`; the contract was right and the expectations were wrong. The ordering is the stronger property and is what C6.2–C6.4 now assert | DONE |
| 2.6 **Section C6 added and running.** Five checks pass against the deployed bytecode with no wallet, no gas and no state change; the sixth prints why it cannot run rather than being skipped silently. `eth_call` executes against the real contract at current state and returns the revert, so every refusal the write path enforces is verified for real | DONE |

### Phase 3 — Physics honesty · DONE

PRODUCT.md is explicit that the station is kinematic with analytic grasping and
that MuJoCo measures the gap rather than replacing the sim. That is a defensible
position and must not be quietly abandoned — but the gap figure is currently
computed per run and shown only on the run page.

| Task | State |
|---|---|
| 3.1 The station's scoring panel now states that it solves inverse kinematics and grasps analytically with no contact simulation, and that every run is afterwards integrated under rigid-body dynamics with the difference published on its own page. The measurement is deliberately **not** run there — the engine is 8 MB of WebAssembly and nobody should pay that to read a brief | DONE |
| 3.2 `/spec` listed "kinematic, not rigid-body" as a caveat and left the reader to guess the cost. It now says how the answer is obtained and links a real run where the number is | DONE |
| 3.3 **Decision: no, not under the station.** Swapping the simulator beneath runs already settled makes them incomparable with each other, and the corpus's value is that every run was measured the same way. If it ever changes it forks the corpus into pre- and post-physics generations and both must be labelled at the point of sale. Measuring the gap per run and publishing it is the position, not a step towards replacing the sim | DONE |

### Phase 4 — Make a minted policy mean something · DONE

A minted policy is currently a cap table over trajectories. PRODUCT.md is honest
that no trained policy exists. The gap between "cap table" and "model" is the
product's biggest conceptual liability.

| Task | State |
|---|---|
| 4.1 Both pages now say it. On `/licence` because that is where someone is looking at a fee and could assume they bought a model; on `/policies` because the word already means a *submitted model* there, so one word meant two things on one product | DONE |
| 4.2 `/licence/[policyId]` now names what the fee buys and links it: the corpus for that task as newline-delimited JSON, plus an open summary to inspect first. The bulk download is gated by CorpusAccess and the gate is stated rather than hidden behind a link that would 402 | DONE |
| 4.3 **Decision: no.** Nine trajectories across three tasks will not train anything that behaves, and a baseline that fails would be read as the corpus failing rather than as nine samples being nine samples. The honest position is the one PRODUCT.md already takes — no trained policy exists, and the interface says so | DONE |

### Phase 5 — First-run cost · DONE (5.3 scoped, not built)

PRODUCT.md names this as the product's own blocker: "Submitting requires a
wallet and a transaction. Many operators will not have one, so first-run cost
has to be near zero." Practice mode exists and is verified; paid submission
still needs a funded wallet.

| Task | State |
|---|---|
| 5.1 **Measured, from six real settled receipts on Fuji: 460,466–600,000 gas per `submitTrajectory`, median 600,000.** Fuji's gas price today is 160 wei, so a run costs effectively nothing and the problem is invisible. Priced at a live network it inverts: 0.0006 AVAX at 1 gwei, **0.015 AVAX at 25 gwei, 0.030 at 50** — against a reward of 0.001 AVAX per run. At 25 gwei an operator pays fifteen times their earnings to be paid. This is the strongest evidence for `docs/AVALANCHE-50.md` items 1–2 and it should be on the record before anyone quotes the current cost as the real one | DONE |
| 5.2 **Documented.** `submitTrajectoryFor(address contributor, …)` is permissionless — the verifier signature binds task, contributor, hash and score, so a relayer moves who pays and forges nothing. Cost to the relayer is the same 460k–600k gas measured in 5.1. Stated on `/contracts`. **Not surfaced as an option in the station, because no relayer service is running**: the path exists on chain and nothing calls it, and offering a button for a service that does not exist would be exactly the roadmap-as-capability this product refuses | PARTIAL |
| 5.3 **DONE — all three claims proven on a real sovereign L1.** Output in `docs/l1-proof.txt`. **36:** the chain issues its own gas token — 25 THN minted to an address holding nothing, the minter's own balance unchanged but for gas. **33:** the operator sets what a run costs — deployer Admin on the fee manager, base fee driven from 2,407,940 wei to the 1,000,000 floor at block 371, halving the cost of a 21,000-gas run. **32:** a minted policy delivered to a second chain — policy 0 minted on the source chain, announced over ICM, and the destination confirmed holding task 0, 2 trajectories, fee 0.5, ten seconds after minting. Everything is read back off the chain rather than reported from what was sent. The working invocation is `--use-local-machine --num-bootstrap-validators 1`; ewoq needed THN on the L1 first, minted through the native minter the same claim proves. Historical detail follows. **Attempted for real, and it got most of the way.** The work was already scripted — `l1/genesis-with-headroom.json` carries chainId 88812 with the native minter, fee manager and warp precompiles admin'd to the deployer, `scripts/l1.mjs` proves the three claims by reading them back, and `.env.deployer` holds the matching key. So: avalanche-cli 1.9.6 installed, a 2-node local network brought up healthy, the subnet and blockchain created with real fees paid, and **`ConvertSubnetToL1Tx` succeeded — the subnet is a sovereign L1**. It stops at `initValidatorManager`, which reaches the L1's own RPC on port 9656 and is refused because the primary-network nodes do not track the new subnet. The remedy is `track-subnets` in `~/.avalanchego/config.json` plus a P2P port and a restart — system configuration outside this repository, and not something to do on a sleeping machine. `l1/README.md` now carries the corrected procedure: its old commands were written for an older CLI and no longer complete, `--bootstrap-endpoints` is required or the conversion fails, and the private key must be bare hex. The local network was stopped afterwards | PARTIAL — L1 created and converted, RPC not served |

### Phase 6 — Test and QA · DONE

| Task | State |
|---|---|
| 6.8 The e2e suite pinned one address and expected corpus access from it forever. CorpusAccess sells time, that subscription lapsed, and CI went red on a schedule while the endpoint was behaving correctly. The test now discovers a currently-active subscriber from the contract's own `Subscribed` logs, confirms `active` on chain, and reports the positive half as unverifiable when nobody holds access rather than failing | DONE |

| Task | State |
|---|---|
| 6.1 Itemised plan and results, regenerated from runner output | DONE — `docs/TESTPLAN.md`, `docs/TEST-RESULTS.md` |
| 6.2 Page, API, chain, flow and matrix runners | DONE — `scripts/qa-*.mjs` |
| 6.3 87 items PASS / 0 FAIL / 1 UNTESTED, 57/57 route×mode clean | DONE |
| 6.4 **Closed — not a user-facing defect.** Three environments, three results: headless Chromium sizes it correctly (832×860 at 1440, 672×760 at 1280); a **headed** browser sizes it correctly even when the tab is loaded in the background (592×801); only the Claude-in-Chrome automation tab shows 300×150, and that tab reports `visibilityState: "hidden"` permanently. A hidden tab has its rendering lifecycle paused so ResizeObserver never fires — which is also why the fix I wrote could not work, and why it was reverted. A real tab becomes visible, the lifecycle resumes, and the canvas sizes. The symptom belongs to a tab that never becomes visible, which is not a state a person's tab is in | DONE |
| 6.5 `scripts/qa-contracts.mjs` — every registry address has bytecode, every address renders on the page, the escrow the page prints matches the node, nothing is unreadable, Warp and ElGamal are both named, console and network clean. 8/8 against production | DONE |
| 6.6 CI exists — `.github/workflows/verify.yml` runs typecheck, eslint, build, projected-size, `forge test`, `forge snapshot --check`, `forge lint`, and `test/e2e.mjs` against the live site, on push, PR, and every 6 hours | DONE |
| 6.7 All seven runners are in CI's `live` job. Six of them exited 0 regardless of result, so wiring them in would have given green builds over red runs; every one now exits non-zero on failure, proven both ways — 0 against production, 1 against a host that cannot answer | DONE |

### Phase 7 — Infrastructure · DONE

| Task | State |
|---|---|
| 7.1 Vercel + Railway split, Postgres, isolated signer | DONE |
| 7.2 `/api/health` separates liveness from historical audit; 200 when live | DONE |
| 7.3 **Confirmed unrecoverable, and the first reason given for it was wrong.** v1 does have an escape hatch — a pull-payment `claim()` — which an earlier grep for withdraw/refund/sweep missed. It changes nothing: `claimable` is **0 for all 19 addresses** this deployment has ever paid or been funded by, so the whole 0.263081 AVAX is unfilled task escrow. Escrow refunds only arrived in V2. Stated on `/contracts` with that reasoning rather than the guess | DONE |
| 7.4 `scripts/ship.mjs` — typecheck, build, Vercel **forced**, then Railway, refusing to continue unless Vercel reports `readyState: READY`. `--check` prints the plan without deploying. Both half-deploy failures this project has actually had are the reason it forces and the reason it does both | DONE |
| 7.5 **Rehearsed.** `scripts/restore.mjs --rehearse` exports the database, restores it into a scratch file and verifies the result against the snapshot's own manifest: 18 trajectories out, 18 back, 0 faults. Between it and the existing drill both halves are now covered — the drill checks every prop's sha256 against its actual bytes on the real 22.8 MB snapshot (`integrity: ok`, 104 trajectories, 3 props, `matchesLive: true`), and this proves the rows write back. The target defaults to a scratch path so a rehearsal cannot touch the live corpus by being run in the wrong directory | DONE |

### Phase 8 — Presentation · DONE

| Task | State |
|---|---|
| 8.1 `docs/DEMO.md` — six steps from a private window with no wallet and nothing cached, each ending on something the watcher can check, plus what not to claim and the numbers worth having ready | DONE |
| 8.2 `https://thenar.io/contracts` — every contract, address, code size, balance, source path, the surface that uses it, and live readings from those with state. Built in Phase 1 and this is the same page | DONE |
| 8.3 **Rehearsed against production: 22.8s across six steps, zero console errors.** `scripts/demo-rehearse.mjs` re-runs and re-times it and exits non-zero if anything logs an error. It caught its own bug first — step 5 read the first 64-hex string in the feed, which is a trajectory hash and never resolves; it reads `tx_hash` by name now and returns a real receipt | DONE |

### Phase 9 — What the contracts could do and the interface could not · DONE

Added 3 Sep 2026, after the build plan closed. It began as sixteen ranked
feature ideas and turned into an audit: five of the items below are not features
at all, but capabilities the deployed contracts already had that no page could
reach. Every one was simulated against the live contract before it shipped.

| Task | State |
|---|---|
| 9.1 `/l1` renders the sovereign-L1 transcript as three checkable claims, generated from `docs/l1-proof.txt` at build time — a runtime `readFileSync` is invisible to Next's file trace and ships empty | DONE |
| 9.2 The Warp payload on `/licence` is decoded to its ten fields and each checked against the protocol by a second route; the real `Attested` event is shown with its block and transaction | DONE |
| 9.3 The station states what a submit will cost before it is signed, measured off real receipts — and reports that the charge never came in below half the gas limit the wallet set | DONE |
| 9.4 **A two-object task could not be finished.** The run ended when the scene settled, and a payload nobody had touched was already at rest, so placing the first object ended the run and scored the second where it spawned. Found by driving a real run; `scripts/qa-run.mjs` drives one every time now | DONE |
| 9.5 Repeated runs on one task are differenced oldest-first on `/operator` and `/portfolio`, with the delta named in millimetres and seconds where the ledger has them | DONE |
| 9.6 The sitting survives leaving the station, and carries a best score | DONE |
| 9.7 An empty corpus says which of its three reasons it is empty for, counted from the same endpoint the list uses | DONE |
| 9.8 `/post` states what the escrow will actually draw, at this deployment's own mean score | DONE |
| 9.9 The failure taxonomy is on the run page — and surfaced that two of thirty stored episodes disagree with the deviation they were scored against, both from before the verifier measured placement from the samples | DONE |
| 9.10 A rejected run is told what one change would have paid, solved backwards into millimetres and seconds | DONE |
| 9.11 Declared difficulty is checked against the ledger on `/hub`, and does not survive the check | DONE |
| 9.12 Every write to the protocol is listed on `/contracts` with its cost, named against the deployed contract's own artifact rather than the pruned ABI the interface calls | DONE |
| 9.13 **`lib/abi.ts` was generated from version one.** The deployed contract is `AxonProtocolV2`; a Task decoded against nine components dropped `expiresAt` and `closed`, so the hub offered a Run button on a task whose funder had already reclaimed the escrow. Every generated file now comes from the deployed artifact | DONE |
| 9.14 `/post` offers a deadline and calls `createTaskUntil`; the task page shows the deadline and, to the funder alone and only past it, the button that reclaims the escrow | DONE |
| 9.15 `CorpusAccess.subscribe` is reachable from `/corpus`. The 402 gate had nowhere to pay | DONE |
| 9.16 `TrajectoryCertificate.mint` is reachable from the run page; the token goes to the recorded contributor, not the caller | DONE |
| 9.17 `ContributionRecord.sync` is reachable from `/operator` and `/portfolio` for any address, which is how the contract intends it | DONE |
| 9.18 The Foundry treasury's proposals, tally, vote and execute are on `/foundry`. Proposal 0 passed 165.00 to nil and had sat unexecuted because nothing could call it | DONE |

**Still unreachable, correctly:** `ConfidentialPayouts.accrue` and
`CorpusManifest.commit` are restricted to the adder and the verifier;
`ConfidentialPayouts.registerKey` belongs to a research path with no surface.

### Phase 10 — The week after · 10 Sep 2026

Three regressions that arrived by themselves, and the outage that is not mine
to fix.

| Task | State |
|---|---|
| 10.1 **The Railway backend is gone.** `web-production-2d1d0.up.railway.app` answers "Application not found" and the project is no longer in the Railway account, so every `/api/*` on thenar.io 404s at the edge. The Postgres behind it held the corpus. Pages served by Vercel are unaffected and still render from chain | **BLOCKED — needs the owner** |
| 10.2 **The standings had gone empty.** `useActivity` walked back 80,000 blocks, which on Fuji is under two days; every run is now 207,760 blocks old, so the leaderboard and the feed returned a legitimate-looking nothing. One million-block `getLogs` in a single call, anchored to the deployment rather than to the clock. Verified on production: eight addresses | DONE |
| 10.3 **The two engines had drifted.** `annotation` and `policy_submission` were created in the Postgres branch of `migrate()` and not the SQLite one, so `/api/policy` and the annotation routes 500'd against every SQLite database. A test compares the branches' tables both ways | DONE |
| 10.4 An empty corpus is a summary, not a missing resource. `/api/dataset/summary` answered 404 — a status its own OpenAPI does not describe — putting a console error on every page previewing a policy over a task with no stored runs, and hiding the "what the licence buys" panel entirely | DONE |
| 10.5 A run page said "nothing on file" when the truth was "we could not ask". Our 404 and the platform's 404 are told apart by whose body it is, tested against the exact envelope thenar.io returned all week | DONE |
| 10.6 Ideas #20, #30 and #48: earnings against gas on `/operator`, the tolerance drawn at the size it actually is, and a nav underline that travels | DONE |
| 10.7 Ideas #45, #61 and #64 — the three ways this product meets a machine that cannot do what it assumes. No WebGL is named and explained rather than thrown into an error boundary; a run in progress is not thrown away without a word; the ground crosses over on a theme change and at no other time. `scripts/qa-degraded.mjs` covers them, in a browser launched with its own flags | DONE |
| 10.8 Idea #59 — three measured RPC endpoints in order, shared by the ten modules that each built their own client. They are not equivalent: the primary answers a million-block `getLogs`, publicnode about fifty thousand, drpc about ten. `lib/scan-logs.ts` halves a range until whoever is answering accepts it, so failing over costs latency and not history — nine accepted runs found either way | DONE |
| 10.9 Ideas #65 and #67 — the conditions bar watched only the primary, so it would have called the chain unreachable while the page read happily from a secondary. It watches all three, and having asked, it asks the time: half the figures here compare a chain timestamp against `Date.now()`, and a machine two minutes out reports the disagreement as fact | DONE |
| 10.10 **Self-inflicted, caught by the suite.** Adding the fallback endpoints without naming them in `connect-src` took the page sweep from 34/41 to nought — the policy doing its job. A test now asserts every host in `RPC_ENDPOINTS` appears in the policy | DONE |
| 10.11 A page counter nobody reads put a failed request on every route while its endpoint was unreachable, which is enough to make a monitor call the whole site broken. It gives up after the first refusal, for the session | DONE |

**What the outage costs the test suite.** Seven page checks assert figures that
lived in the deleted database — A31, A33, A35, A36, A37, A38 and A42. They are
not weakened to pass against whatever is left; they stay red, and they are the
measure of what a restore would have to bring back.

---

## 3. Gap list

Every gap found by reading the codebase and the live deployment, tied to the
task it blocks. Ordered by severity.

### Severity 1 — visible to a judge

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| G1 | Six deployed, Sourcify-verified contracts have **zero** application references | `grep -rl` over `app components lib` returns 0 files for TrajectoryCertificate, ConfidentialPayouts, LicenceReceipt, ContributionRecord, Referrals, PrizePool | Phase 1, W4 |
| G2 | README's first sentence says runs are "paid on **Monad**"; the chain is Avalanche Fuji | `README.md` line 3 vs `lib/chain.ts` | 0.1, W1 |
| G3 | The two strongest Avalanche-specific pieces already built — Warp attestation (LicenceReceipt) and ElGamal confidential payouts — are invisible | Deployed with code, 0 app references | 1.6, 1.7, W3 |
| G4 | The write path has never been exercised in test | `docs/TEST-RESULTS.md` C6 UNTESTED | Phase 2 |

### Severity 2 — correctness and truth

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| G5 | 0.263081 AVAX stranded in superseded AxonProtocol v1 | `getBalance` on `0x025dB4…`; no `withdraw`/`refund`/`sweep` in `contracts/src/AxonProtocol.sol` | 7.3 |
| G6 | Station canvas stays 300×150 in a hidden tab and does not recover | Reproduced in real Chrome; container 500×334. Fix written, tested, reverted as ineffective | 6.4 |
| G7 | A minted policy is a cap table, not a model, and the interface does not say so on `/policies` | `NON_CAPABILITIES` names it; the policy pages do not | 4.1, W2 |
| G8 | Licensing delivers no artefact — there is no download behind a licence | No export path from `/licence/[policyId]` | 4.2 |
| G9 | MuJoCo divergence is measured per run but shown only on the run page | `/api/physics/[hash]` returns `engine: "MuJoCo 3.1.16, WebAssembly"`; the station does not display it | 3.1 |

### Severity 3 — repo hygiene

| # | Gap | Evidence | Blocks |
|---|---|---|---|
| G10 | Four stale root TESTPLAN files alongside the current pair in `docs/` | `TESTPLAN.md`, `-V2`, `-V3`, `-V4` | 0.5 |
| G11 | Repo named `monad-blitz`, remote `axon-monad`, product Thenar on Avalanche | `git remote -v`, directory name | 0.6 |
| G12 | An API change deployed only to Vercel silently does nothing | `next.config` `rewrites()` → `BACKEND_ORIGIN` | 0.4, 7.4 |
| G13 | CI runs the older `test/e2e.mjs` against the live site, but not the newer `scripts/qa-*.mjs` runners that produce the itemised plan result | `.github/workflows/verify.yml` `live` job | 6.7 |
| G14 | Snapshots are exported daily and verified by checksum, but no restore path has ever been exercised. An untested restore is not a backup | `/api/snapshot/drill` returns a real artefact; no restore code or procedure exists | 7.5 |
| G15 | `/foundry` the page and `Foundry.sol` the contract are unrelated but identically named | `app/foundry/page.tsx` reads `/api/dataset/summary`; the contract is unreferenced | 1.5 |

### Not gaps — checked and deliberate

Recorded so a future audit does not re-raise them:

- **No mocks, stubs, fixtures or fallback data.** `grep` for mock/stub/fake/dummy
  returns only HTML input `placeholder` attributes and one Solidity comment.
  `FALLBACK_SCENE` in the station is unreachable — the component returns at
  `if (!task)` before the viewport renders.
- **`/api/sign` returning 503 on the web service is correct.** The key belongs to
  the signer service; a web service that could sign would be the bug.
- **`/api/dataset?taskId=` returning 402 is correct.** It is the CorpusAccess
  paywall, and the single-episode path is deliberately open.
- **Kinematic simulation is a documented position, not an omission.** See
  PRODUCT.md; replacing it would make settled runs incomparable.
- **Passkey run-authorisation does not work as deployed and is documented as
  such.** Register/prove/revoke do work. WebCrypto always hashes what it signs,
  so a browser cannot produce a signature over the raw trajectory hash. Closing
  it means redeploying the protocol and orphaning recorded runs.
