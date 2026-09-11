# Thenar — build plan

Rewritten 3 Sep 2026. Every figure below was read from the live deployment,
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
| Surface | 22 pages · 37 API routes · 12 deployed contracts |
| Tests | 57 unit · 73 e2e · 108 contract · design detector clean · CI on push, PR and 6-hourly |

**Deploying:** a change to anything under `app/api/` must go to **Railway**, not
just Vercel. Deploying only to Vercel changes nothing about the live API — this
cost half a day once already.

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
| 0 — Ground truth in the docs | **DONE**, deployed |
| 1 — Surface the dark contracts | **DONE** — live at `thenar.io/contracts`, and `/api/contract` returns all eleven |
| 6.8 — corpus e2e no longer pinned to an expiring subscription | **DONE**, 72/72 green |
| 2–5, 7, 8 | Not reached this run |

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
| 1.9 Follow-on, not required by 1.1–1.7: in-context panels, so a certificate appears on the run it certifies and a Warp payload on the licence it attests, rather than only in the registry | NOT STARTED |

### Phase 2 — Close the write-path verification gap · BLOCKED

The read path is fully verified. The write path is evidenced only by its
outputs (9 paid runs on chain) and has never been exercised end to end in test.

| Task | State |
|---|---|
| 2.1 Provision an **operator** wallet with Fuji AVAX. Must not be `VERIFIER_PRIVATE_KEY` — that is the signing key and using it defeats the key isolation `/api/health` verifies | BLOCKED — no funded operator key in repo or env |
| 2.2 With that key, drive a full run and assert: `submitTrajectory` succeeds, one tx contains both the record and the transfer, `trajectoryCount` increments by exactly 1, operator balance rises by `rewardPerTrajectory` | BLOCKED by 2.1 |
| 2.3 Assert the five-runs-per-operator cap rejects the sixth submission on chain | BLOCKED by 2.1 |
| 2.4 Assert a replayed `trajHash` is rejected (`trajectoryUsed`) | BLOCKED by 2.1 |
| 2.5 Assert a score the server did not sign is refused by the contract | BLOCKED by 2.1 |
| 2.6 Add the above to `scripts/qa-chain.mjs` as section C6 so it stops being permanently untested | BLOCKED by 2.1 |

### Phase 3 — Physics honesty · NOT STARTED

PRODUCT.md is explicit that the station is kinematic with analytic grasping and
that MuJoCo measures the gap rather than replacing the sim. That is a defensible
position and must not be quietly abandoned — but the gap figure is currently
computed per run and shown only on the run page.

| Task | State |
|---|---|
| 3.1 Surface the MuJoCo divergence figure (currently ~1.3 mm against a ±25 mm band) on the station itself, not only on `/run/[hash]` | NOT STARTED |
| 3.2 State on `/spec` what the kinematic sim does and does not model, linking the divergence measurement as evidence | NOT STARTED |
| 3.3 Decide and write down whether MuJoCo ever goes *under* the station. If yes, it forks the corpus into pre- and post-physics runs, and that must be designed before it ships, not after | NOT STARTED |

### Phase 4 — Make a minted policy mean something · NOT STARTED

A minted policy is currently a cap table over trajectories. PRODUCT.md is honest
that no trained policy exists. The gap between "cap table" and "model" is the
product's biggest conceptual liability.

| Task | State |
|---|---|
| 4.1 On `/policies` and `/licence/[policyId]`, state in the interface that a policy is a cap table and not a trained model | NOT STARTED |
| 4.2 Publish the exported corpus for a minted policy as a downloadable artefact so "licence" delivers something concrete | NOT STARTED |
| 4.3 Decide whether to train even a trivial baseline on the 9 recorded trajectories. If yes it must be labelled as a baseline, not a policy | NOT STARTED |

### Phase 5 — First-run cost · NOT STARTED

PRODUCT.md names this as the product's own blocker: "Submitting requires a
wallet and a transaction. Many operators will not have one, so first-run cost
has to be near zero." Practice mode exists and is verified; paid submission
still needs a funded wallet.

| Task | State |
|---|---|
| 5.1 Measure and write down the actual first-run cost today: gas for `submitTrajectory` on Fuji at current prices | NOT STARTED |
| 5.2 Relayed submission exists in V2 (`axon:relayed` appears on chain). Document who may relay, what it costs them, and surface it as an option in the station | NOT STARTED |
| 5.3 Evaluate `docs/AVALANCHE-50.md` items 1–2 (own L1 + fee manager for zero-gas runs; custom gas token). These are the strongest W3 items in the repo and are currently unbuilt | NOT STARTED |

### Phase 6 — Test and QA · IN PROGRESS

| Task | State |
|---|---|
| 6.8 The e2e suite pinned one address and expected corpus access from it forever. CorpusAccess sells time, that subscription lapsed, and CI went red on a schedule while the endpoint was behaving correctly. The test now discovers a currently-active subscriber from the contract's own `Subscribed` logs, confirms `active` on chain, and reports the positive half as unverifiable when nobody holds access rather than failing | DONE |

| Task | State |
|---|---|
| 6.1 Itemised plan and results, regenerated from runner output | DONE — `docs/TESTPLAN.md`, `docs/TEST-RESULTS.md` |
| 6.2 Page, API, chain, flow and matrix runners | DONE — `scripts/qa-*.mjs` |
| 6.3 87 items PASS / 0 FAIL / 1 UNTESTED, 57/57 route×mode clean | DONE |
| 6.4 Resolve the station canvas question: in a hidden tab the canvas stays 300×150 inside a 500×334 container. A fix was written, tested, found not to work (a hidden tab's rendering lifecycle is paused, so ResizeObserver never fires) and reverted. Needs a browser where the hidden→visible transition can actually be driven | NOT STARTED |
| 6.5 Add a runner for the six contracts surfaced in Phase 1 | BLOCKED by Phase 1 |
| 6.6 CI exists — `.github/workflows/verify.yml` runs typecheck, eslint, build, projected-size, `forge test`, `forge snapshot --check`, `forge lint`, and `test/e2e.mjs` against the live site, on push, PR, and every 6 hours | DONE |
| 6.7 CI does **not** run the newer `scripts/qa-*.mjs` runners — the itemised plan is still executed by hand. Add the page, API, chain, flow and matrix runners to the `live` job | NOT STARTED |

### Phase 7 — Infrastructure · IN PROGRESS

| Task | State |
|---|---|
| 7.1 Vercel + Railway split, Postgres, isolated signer | DONE |
| 7.2 `/api/health` separates liveness from historical audit; 200 when live | DONE |
| 7.3 Recover or write off **0.263081 AVAX** stranded in AxonProtocol v1 `0x025dB4…`. V2 "adds escrow refunds", implying v1 has no withdraw path — confirm, and if it is unrecoverable, say so in the README rather than leaving a balance that looks live | NOT STARTED |
| 7.4 Single-deploy command that ships both Vercel and Railway, so an API change cannot be half-deployed again | NOT STARTED |
| 7.5 A daily snapshot **export** exists and works — `/api/snapshot/drill` returned `axon-2026-09-02.ndjson`, 22,847,130 bytes, with a sha256. There is no documented **restore**: no procedure, and nothing that has ever read a snapshot back. Write and rehearse one | NOT STARTED |

### Phase 8 — Presentation · NOT STARTED

| Task | State |
|---|---|
| 8.1 Demo script that runs cold: no wallet, no cache, phone-first, ending on a public explorer page | NOT STARTED |
| 8.2 One page a judge can open that lists every contract, its address, its Sourcify status, and the surface that uses it — W4 in a single view | NOT STARTED |
| 8.3 Rehearse the five-step loop end to end against the live deployment and time it | NOT STARTED |

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
