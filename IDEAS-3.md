# A hundred more

The first hundred are built. These are the next hundred, and none of them
repeats one: no idea here is a restatement of something in IDEAS.md, and the
twenty-five that were refused there stay refused.

The project is a data foundry. An operator drives a six-axis arm in a browser,
the run is scored from its own samples and paid on Avalanche Fuji, and a buyer
licences the corpus. So the question these ideas are ranked against is not
"what else could the site do" but **what makes the data worth more, and what
makes the claim about it checkable**.

Scored impact × feasibility × fit, out of 125. Fit is the one that kills
things: a feature that adds a surface without strengthening the argument is
worth less than nothing on a demo.

## Tier 1 — build first (≥ 80)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 1 | **Phase segmentation** — split every trajectory into reach / grasp / transport / place / release from the samples alone, and ship the boundaries in the corpus. A VLA trains on segments; right now a buyer gets one undifferentiated blob and has to segment it themselves. | 5 | 5 | 5 | **125** |
| 2 | **Record the failures too** — a run that misses the datum currently vanishes. Negative examples are the scarcest thing in manipulation data, and this is throwing them away by design. Stored, served, unpaid, and clearly labelled. | 5 | 5 | 5 | **125** |
| 3 | **On-chain corpus manifest** — a Merkle root of a task's episode hashes committed when the policy mints, so a buyer can prove the corpus they downloaded is the corpus that was sold, and prove a single episode belongs to it. | 5 | 4 | 5 | **100** |
| 4 | **State-space coverage map** — where in the reachable workspace runs actually start and finish, drawn per task. Shows a funder what they have bought and what is missing. | 4 | 5 | 5 | **100** |
| 5 | **Near-duplicate rejection at verify time** — a run that is a copy of one already in the corpus adds nothing and is paid for anyway. Measured by trajectory distance, refused with the run it duplicates named. | 5 | 4 | 5 | **100** |
| 6 | **Corpus in one view** — every episode of a task as a 3D ribbon in the same space, orbitable. The single image that says "this is a dataset" rather than "this is a form". | 4 | 5 | 5 | **100** |
| 7 | **Merkle inclusion proof in the browser** — paste an episode hash, get the path to the on-chain root, verified client-side. | 4 | 5 | 5 | **100** |
| 8 | **Auto-generated datasheet** — the Datasheets-for-Datasets questions answered from real figures: provenance, collection method, splits, known limitations, the unbacked payouts. | 4 | 5 | 4 | 80 |
| 9 | **Train / val / test split published with the corpus**, held out by episode and by operator so a buyer cannot leak across the split by accident. | 4 | 5 | 4 | 80 |
| 10 | **Command palette** — ⌘K over tasks, runs, operators and pages. Judges navigate a demo faster than the person demoing it. | 3 | 5 | 4 | 60 |

## Tier 2 — build if the top holds (60–79)

| # | Idea | Score |
|---|---|---|
| 11 | Per-run OG image with the actual trajectory drawn, not a template | 75 |
| 12 | Demo mode: a self-driving tour that plays the whole loop unattended | 75 |
| 13 | Failure taxonomy — classify why a run failed, from the samples | 72 |
| 14 | Phase timeline on the run page, scrubbable by phase | 72 |
| 15 | Corpus explorer with filters over every episode on the contract | 70 |
| 16 | Challenge window: anyone may dispute a score by recomputing it and posting a bond | 70 |
| 17 | Session keys, so an operator signs once per session rather than per run | 68 |
| 18 | Policy leaderboard — submit a policy, have it evaluated on held-out starts | 68 |
| 19 | Wrist-camera view synthesised from the trajectory, for pixel-conditioned training | 66 |
| 20 | Table heatmap of every placement ever recorded on a task | 65 |
| 21 | Time-lapse of a task filling, from the ledger's timestamps | 64 |
| 22 | Onion-skin several runs at once on the replay | 63 |
| 23 | Adjustable replay speed and frame-accurate stepping | 62 |
| 24 | Similar-run finder: the closest trajectory to this one, by distance | 62 |
| 25 | Corpus diversity score, published per task | 62 |
| 26 | Active-start suggestion — where to begin the next run to cover a gap | 60 |
| 27 | OpenAPI spec for the public read surface | 60 |
| 28 | Per-episode operator annotation, written by the person who drove it | 60 |
| 29 | Gas snapshot regression in the contract suite | 60 |
| 30 | Contract static analysis in CI | 60 |

## Tier 3 — worth building, lower leverage (40–59)

| # | Idea | Score |
|---|---|---|
| 31 | Force estimate per frame, derived from joint acceleration | 58 |
| 32 | Depth buffer exported alongside a synthesised camera view | 55 |
| 33 | Licence as a transferable receipt, resellable | 55 |
| 34 | Secondary market for licences | 50 |
| 35 | Bonding-curve licence price that rises with corpus size | 50 |
| 36 | Time-boxed exclusive licence | 48 |
| 37 | On-chain operator reputation derived from history | 52 |
| 38 | Threshold verifier — two of three signers | 52 |
| 39 | Slashing a verifier that signs a score the samples refute | 50 |
| 40 | Cross-chain licence purchase over ICM | 50 |
| 41 | Streaming payment per frame rather than per run | 48 |
| 42 | Escrow release schedule with a challenge window | 48 |
| 43 | AVAX/USD display from a real Fuji price feed | 46 |
| 44 | Royalty split exposed in an ERC-2981-shaped view | 45 |
| 45 | Trajectory compression, measured against the raw JSON | 45 |
| 46 | Corpus storage-cost projection for a funder | 44 |
| 47 | Per-task data licence terms, chosen by the funder | 44 |
| 48 | Provenance chain: which policy trained on which corpus version | 52 |
| 49 | Auto-generated model card for a minted policy | 50 |
| 50 | Reward-model preference pairs derived from score differences | 46 |
| 51 | Second embodiment — a seven-axis arm alongside the six | 45 |
| 52 | URDF import, drive an arbitrary arm | 40 |
| 53 | Gamepad teleoperation | 42 |
| 54 | Robot-agnostic joint-command export | 44 |
| 55 | Natural-language search over task instructions | 42 |
| 56 | Similar-task recommendations | 40 |
| 57 | Embeddable single-task widget | 40 |
| 58 | Trajectory smoothing preview — what a smoother run would have scored | 44 |
| 59 | What-if score calculator on the run page | 42 |
| 60 | Camera undo/redo in the station | 40 |

## Tier 4 — real but low leverage (below 40)

| # | Idea | Score |
|---|---|---|
| 61 | Scroll-driven arm articulation on the landing page | 38 |
| 62 | Hero arm reacts to cursor proximity | 36 |
| 63 | Page transitions that carry the arm between routes | 35 |
| 64 | Generative poster per run, downloadable | 35 |
| 65 | Spectator mode cycling recent runs | 34 |
| 66 | Copy-hash micro-interaction | 32 |
| 67 | Skeletons that match final layout exactly | 34 |
| 68 | Focus ring styled to the brand | 30 |
| 69 | Split-screen human vs policy, synchronised | 38 |
| 70 | Request tracing across web and signer | 38 |
| 71 | Documented structured error codes | 36 |
| 72 | Dependency audit in CI | 34 |
| 73 | Secret scanning in CI | 34 |
| 74 | Bundle-size budget enforced | 33 |
| 75 | Lighthouse budget enforced | 32 |
| 76 | Automated accessibility audit in CI | 36 |
| 77 | Visual regression tests | 30 |
| 78 | Contract invariant fuzzing | 38 |
| 79 | Migration rollback path | 32 |
| 80 | Connection pooling and a read replica | 30 |
| 81 | Graceful shutdown | 28 |
| 82 | Health check with per-dependency timings | 34 |
| 83 | Alert when the unbacked count rises | 36 |
| 84 | Scripted snapshot restore-and-diff | 34 |
| 85 | Canary check after deploy | 30 |
| 86 | Per-endpoint rate-limit headers | 32 |
| 87 | Idempotent prop upload by content hash | 30 |
| 88 | Corpus statistics endpoint for buyers | 38 |
| 89 | Dataset schema version in the export | 36 |
| 90 | Episode-level checksums in the export | 34 |

## Tier 5 — considered and rejected

Listed because a hundred ideas that are all good is a list that was not
thought about.

| # | Idea | Why not |
|---|---|---|
| 91 | Auto-tune the scoring weights per task | The score is the payout. A weight that moves is a payout nobody can predict or check. |
| 92 | Pay more for longer runs | Rewards padding, and the efficiency term already exists to say the opposite. |
| 93 | Operator chat during a run | The run is a measurement. A chat window is a second thing happening in it. |
| 94 | Public operator profiles with names and avatars | There are no accounts here. A profile is an identity, and the address is the only claim this system can prove. |
| 95 | Auto-approve runs from trusted operators | The whole point is that nothing is trusted; it is recomputed. |
| 96 | A staking pool for operators | Adds a token economy the product does not need to work. |
| 97 | Fiat on-ramp | Real money, and a compliance surface a hackathon demo cannot honestly carry. |
| 98 | Recorded video of the operator's screen | Bandwidth and privacy cost for data the samples already contain exactly. |
| 99 | Third-party model hosting | Not this project's problem, and it would make the demo about somebody else's infrastructure. |
| 100 | Generative task instructions from an LLM | Refused in the first hundred and still refused: an instruction nobody verified is a task that may not be doable. |

---

# What got built

Twenty-six of the hundred, top of the list down, each verified against the
live site with real data before the next was started. Regression after every
one: **57 unit tests, 73 end-to-end assertions, 108 contract tests**, all
passing, and `/api/health` reporting the same single known fault it reported
at the start.

| # | Idea | Evidence it is real |
|---|---|---|
| 1 | Phase segmentation | `lib/phases.ts`, 8 tests. A live 1,541-frame episode cuts into reach 3.9s / grasp / transport 68.9s / place 0.2s / release 3.8s. Shipped in the corpus export and drawn on the run page. |
| 2 | Record the failures | The verifier was already storing them under `settled = 0`, unseen. `/api/task/N/attempts` splits paid / failed / unsubmitted; a real miss was recorded through the live verifier and appears in the export's `negatives`. Task 2 now reports a true 50% pass rate. |
| 3 | On-chain corpus manifest | `CorpusManifest` deployed to Fuji at `0x318e5faf04c9db5d844aaa93850e71406012dd62`, 9 contract tests. Three real task corpora committed. |
| 4 | Workspace coverage | Live on task 0: 2% of the reachable annulus, 12 cells lit against 568 unlit. An honest and unflattering number, which is the point. |
| 5 | Near-duplicate rejection | `lib/similarity.ts`, 8 tests. Against the live corpus: an identical route refused at 0 mm, the same route 82% slower refused at 0.07 mm, a 5 mm variant refused at 2.4 mm, genuinely different routes accepted. |
| 7 | Merkle proof in the browser | A proof built by `lib/merkle.ts` verified by the browser walk **and** by the contract's — the cross-language check that decides whether a commitment means anything. 10 tests. |
| 8 | Auto-generated datasheet | `/api/task/N/datasheet`, every figure computed at request time. Carries the limitations: simulation only, concentrated coverage, deployer-funded demand, three unbacked payouts. |
| 9 | Published train/val/test split | Held out by contributor rather than by episode, deterministic from the address. 3 tests. |
| 10 | Command palette | ⌘K, subsequence search over pages, tasks and stations; a pasted hash or address is a destination. Verified navigating to `/spec`. |
| 13 | Failure taxonomy | `lib/failure.ts`, 7 tests. The recorded failure is labelled `dropped` — "Let go 54 mm above the table". |
| 14 | Phase timeline on the run page | Clickable segments that seek the replay, drawn from the same function the corpus ships. |
| 23 | Frame-accurate replay control | Frame stepping verified exact on the live page: 281 → 280 → 281, 14.0s → 13.9s. Play/pause toggles. **Time-based playback is built and not verified** — see below. |
| 24 | Similar-run finder | `/api/trajectory/{hash}/similar`, measured with the same function the verifier refuses duplicates with, so 14 mm here and 14 mm in a rejection mean the same thing. |
| 25 | Corpus diversity | On task 0: 0.34 mm mean pairwise separation, closest pair 0 mm. Three episodes that are one route. Shown on the task page with the reason. |
| 12 | Demo mode | Six steps through the loop, each a navigation to the live surface. Verified stepping from `/hub?tour=1` to `/task/0?tour=2`. |
| 15 | Corpus explorer | `/corpus` and `/api/corpus`: 28 episodes, 38,348 frames, filterable by outcome and task. |
| 18 | Policy leaderboard | `/policies` and `/api/policy`. The live server rolled out the real shipped policy and measured **8/8 grasped, 5/8 placed, median 0 mm** — matching its published result. Nothing submitted is executed; a policy is 3,076 numbers. |
| 20 | Placement heatmap | Every accepted run's resting position against the goal ring and the ±25 mm band. Verified: 3 dots on task 0. |
| 21 | Fill history | The only view of a task as something that happened over time rather than a total. Verified: 3 points, Aug 31 to Aug 31. |
| 22 | Onion-skin on the run page | Two sibling paths drawn behind the run's own, in the same projection. |
| 26 | Active-start suggestion | The crosshair marks the middle of the largest hole in coverage, by maximin distance. |
| 27 | OpenAPI spec | `/api/openapi`, 22 paths, and the e2e suite fetches every one and asserts the status is documented. |
| 28 | Per-episode annotation | Signed by the recording address only. Verified: 401 on a bad signature, 403 on a stranger, 200 and read back on a real signed one. |
| 29 | Gas snapshot regression | `.gas-snapshot` committed; `forge snapshot --check --tolerance 1` in CI. |
| 30 | Contract tests and lint in CI | A `contracts` job running `forge test`, the gas gate and `forge lint`. |

## A regression I caused and caught

Adding annotations to the corpus export broke the download with
`Cannot access 'v' before initialization`: the lookup was declared after the
map that reads it, and a const referenced from a callback which runs
immediately is still in its temporal dead zone. The type checker allows it
because the reference sits inside a closure; the runtime refuses it because
the closure runs now. It compiled, typechecked and linted clean.

The end-to-end suite's subscription assertion caught it — the one check that
actually downloads a corpus. Fixed, redeployed, and the download is back at
372,073 bytes.

## Built but not fully verified

**23, time-based playback.** Frame stepping, the speed buttons and the
play/pause toggle were all verified on the live page. The clock-driven
advancement was not: the automation pane reports `visibilityState: "hidden"`
and **zero requestAnimationFrame ticks per second**, so the loop cannot run
there — the same limitation that stops react-three-fiber drawing in that pane.
The logic is deployed and the controls around it work; a browser with a visible
tab is the one thing this environment cannot supply.

## What the new measurements found

Worth stating because it is unflattering and was invisible before. Task 0's
three episodes sit **0.34 mm apart on average, with the closest pair at 0 mm**,
against a coverage of **2% of the reachable workspace**. They are one route
recorded three times. The duplicate rejection built as idea 5 would have
refused two of them; they predate it, and the task page now says so rather
than reporting a mean of 94.87 and leaving it there.

## Not built, and why

- **11 (per-run OG image)** — skipped on evidence, not effort. `scripts/og.mjs`
  records that the `opengraph-image` route convention built locally, appeared
  in the routes manifest and returned 404 on this host, which is why the
  project generates a static card instead. Re-fighting that was a poor trade
  against the features above.
- **6 (corpus as one 3D view)** — the path overlay already draws every accepted
  approach to a task in 2D. A third dimension would have been a new surface
  restating an existing one.
- **12, 15–100** — time. The list is ranked so what remains is what mattered
  least, and the tiers below 60 are mostly production chores and motion
  polish rather than argument.
- **91–100** — refused on the merits, and the reasons are in the table above.
