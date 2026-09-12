# The next hundred

Written 3 Sep 2026, after the run that surfaced every deployed contract, proved
the sovereign L1, and closed the build plan. Nothing here repeats IDEAS.md,
IDEAS-2.md, IDEAS-3.md or docs/AVALANCHE-50.md, and nothing here is already
shipped.

One thing changed today that unlocks a whole bucket: **the L1 works**. Claims 36,
33 and 32 are shown against a live sovereign chain — own gas token, fee manager
at runtime, a policy delivered across chains by ICM. AVALANCHE-50 could only
propose those. They are now buildable, and that is where the highest-value
ideas sit.

Scored **impact × feasibility × fit**, 1–5 each, max 125. Impact = would a judge
notice. Feasibility = buildable for real, here, now, with the credentials that
exist. Fit = strengthens the pitch rather than cluttering it.

---

## What was built, 3 and 10 September 2026

Twenty-six of these are shipped, verified against the live deployment and marked
below. The order was not the ranking: building each one turned up the next, and
five of the sixteen are not features at all but things the interface could not
do that the contracts already could — the audit that found them is at the end.

Two are marked and stay unbuilt for the reason the list itself gives: #1 and #2
need a judge to reach an L1 that runs on 127.0.0.1.

---

## Tier 1 — build these (95+)

Two corrections made before building, under this list's own scoring rule: #1 and
#2 assumed a judge could reach the L1. They cannot — it is local-only. Their
impact stands and their feasibility does not, so **#3 is the top buildable
item**, and it is the one that carries the L1 story to somebody with a browser.

| # | Idea | Score | Why |
|---|---|---|---|
| 1 | **Zero-gas run on the L1, shown side by side.** The station offers Fuji or the L1. On the L1 the fee manager puts the operator's cost at zero and the page prints both numbers. | ~~125~~ **60** | Impact is real; feasibility is not. The L1 runs on 127.0.0.1 — a judge opening thenar.io cannot reach it, and hosting a validated L1 is not a change to this repository. Demoted on the honesty rule this list is scored by |
| 2 | **Pay the operator in the gas token they spend.** On the L1, `submitTrajectory` pays THN, which is also the gas. | ~~120~~ **60** | Same wall as #1, and for the same reason |
| 3 | **The L1 proof, on the site.** `/l1` renders `docs/l1-proof.txt` as three checkable claims with the chain IDs and block numbers. | 120 | Turns a local script into something a judge can read without a terminal — **BUILT — /l1, three claims with the figures read off that chain** |
| 4 | **Cross-chain policy receipt in the product.** The ICM delivery that claim 32 proves, surfaced on `/licence` as "announced to chain X at block N". | 115 | The Warp/ICM story stops being a contract nobody sees — **BUILT — the Warp payload decoded and cross-checked field by field on /licence** |
| 5 | **First-run cost, stated on the station.** 460,466–600,000 gas measured; print what this run will cost before it is submitted. | 110 | Honesty as a feature, and it sets up the L1 answer — **BUILT — measured gas, and the finding that the charge tracks the wallet's own limit** |
| 6 | **Run-to-run improvement.** An operator's five runs on a task, scored against each other, with the delta named. | 110 | The repetition loop finally has a narrative — **BUILT — /operator and /portfolio, oldest attempt first, deltas named** |
| 7 | **Session summary.** On leaving the station: runs, accepted, earned, best score, time. | 105 | Every operator sees it; costs nothing to compute — **BUILT — the sitting now survives leaving the station, and carries a best** |
| 8 | **Empty-corpus buyer view.** `/corpus` when a task has no trainable episodes says so and why, rather than rendering zeros. | 105 | The unglamorous finish that separates done from demoed — **BUILT — /corpus says which of the three reasons it is empty for** |
| 9 | **Task authoring preflight.** `/post` shows the escrow, the per-run reward and the total before signing. | 100 | Funders are half the market and the flow is currently blind — **BUILT — what the escrow draws, what happens to the rest, and a deadline that gets it back** |
| 10 | **Failure taxonomy on the run page.** Which of the four failure modes this run hit, named. | 100 | Turns a low score into a lesson — **BUILT — named on the run page, with the sample it happened on** |

## Tier 2 — build if the top ten land (80–94)

| # | Idea | Score |
|---|---|---|
| 11 | Personal best marker in the viewport, ghosted against the current run | 94 |
| 12 | Operator streak: consecutive accepted runs, on the profile | 92 |
| 13 | "What would have paid" — the score needed to clear the floor, on a rejected run | 92 — **BUILT — solved backwards into the units an operator drives in** |
| 14 | Corpus diff: what a licence buys today versus last week | 90 |
| 15 | Task difficulty calibrated from real pass rates rather than declared | 90 — **BUILT — declared difficulty checked against the ledger on /hub, and it loses** |
| 16 | Live slot pressure: how fast a task is filling, on the hub | 88 |
| 17 | Reward-per-minute, computed from par and payout, on every task row | 88 — **BUILT — per minute of par, on every task row** |
| 18 | Warp message decoder on `/licence` — payload rendered as fields | 86 |
| 19 | Contract call log: every write this deployment has made, with its cost | 86 — **BUILT — every write to the protocol on /contracts, with its cost** |
| 20 | Operator's own gas spend against earnings, on the portfolio | 85 — **BUILT — earnings against gas on /operator; this address earned 1,247,525× what it paid** |
| 21 | Prop provenance: which runs used which uploaded prop | 84 |
| 22 | Referral link with its claim state, on the portfolio | 84 — **BUILT — link, cap, pot and the claim, on /portfolio; the claim is the newcomer's to make** |
| 23 | Foundry treasury vote UI, on `/contracts` | 83 — **BUILT — the treasury's proposals, tally, vote and execute, on /foundry** |
| 24 | Prize pool entry from the task it funds | 83 |
| 25 | Trajectory certificate mint, from the run page | 82 — **BUILT — mintable from the run page, to whoever recorded it** |
| 26 | Corpus subscription purchase flow | 82 — **BUILT — the corpus gate can be paid, on /corpus** |
| 27 | Task expiry and escrow refund, surfaced | 81 — **BUILT — deadlines on /post, and the funder's reclaim on the task page** |
| 28 | Per-scenario pass rates on `/spec` | 80 |
| 29 | Score distribution histogram per task | 80 |
| 30 | The datum circle drawn to scale on the task page | 80 — **BUILT — the ring, the band and the payload at one scale, from lib/bench.ts** |

## Tier 3 — design and motion (70–79)

| # | Idea | Score |
|---|---|---|
| 31 | Payout moment: the figure counts up in tabular numerals as the receipt lands | 79 |
| 32 | The arm settles into its rest pose when a run ends, rather than cutting | 78 |
| 33 | Datum ring pulses once on contact, never idly | 78 |
| 34 | Score gauge sweeps to its value rather than appearing at it | 77 |
| 35 | Slot tally fills one block at a time as the number changes | 77 |
| 36 | Hub rows enter in document order on first paint, once | 76 |
| 37 | The tool path draws itself behind the arm as it moves | 76 |
| 38 | Task cards on the floor breathe with live occupancy | 75 |
| 39 | Poster wordmark parallax carried onto `/spec` and `/corpus` | 75 |
| 40 | Section rules draw from their centre on scroll, as on the landing | 74 |
| 41 | The gripper's jaws animate to their real 42 mm stroke | 74 |
| 42 | Loading states drawn as the instrument assembling, everywhere | 73 |
| 43 | Number transitions use tabular figures so nothing jitters | 73 |
| 44 | Focus rings drawn as dimension terminators, not browser default | 72 |
| 45 | The theme toggle animates the ground rather than snapping | 72 — **BUILT — scoped to the press, so it never lags the pointer** |
| 46 | Reject state hatches rather than reddens, matching the tolerance band | 71 |
| 47 | Hover on a leaderboard row ghosts that operator's best path | 71 |
| 48 | The nav's active item is a drawn underline that slides | 70 — **BUILT — one underline that travels, measured against the active item's own box** |
| 49 | Print stylesheet for the run page, as a certificate | 70 |
| 50 | Reduced-motion variants for every one of the above | 70 |

## Tier 4 — production readiness (60–69)

| # | Idea | Score |
|---|---|---|
| 51 | Every API route documented in the OpenAPI with example responses | 69 |
| 52 | Rate limit headers on every write route | 68 |
| 53 | Structured error codes, not prose, in API errors | 68 |
| 54 | Retry-after on the corpus paywall | 67 |
| 55 | Idempotency key on submission | 67 |
| 56 | Health check for the relayer, when the L1 is live | 66 |
| 57 | Snapshot restore wired into CI as a nightly drill | 66 |
| 58 | Chain reorg handling on the feed | 65 |
| 59 | RPC failover to a second endpoint | 65 — **BUILT — three measured endpoints in order, and a scan that narrows to whichever answers** |
| 60 | Wallet-disconnect mid-run handled without losing the recording | 64 |
| 61 | Browser-back during a run warns before discarding | 64 — **BUILT — on during a run, released once the draft store has the samples** |
| 62 | Offline queue: a run recorded offline submits when the network returns | 63 |
| 63 | Storage-blocked browsers degrade to session-only | 63 |
| 64 | WebGL-unavailable fallback that still explains the product | 62 — **BUILT — names the task, says why, and points at what needs no GPU** |
| 65 | Slow-RPC banner distinct from the offline banner | 62 — **BUILT — the bar watches every endpoint now, so a dead primary is not reported as a dead chain** |
| 66 | Duplicate-tab detection on the station | 61 |
| 67 | Clock-skew detection against block timestamps | 61 — **BUILT — measured against the latest block, named in minutes and in the right direction** |
| 68 | Corpus export resumable for large tasks | 60 |
| 69 | Prop upload size and triangle budget enforced with a stated reason | 60 |
| 70 | Every 4xx on the site carries a way forward, not just a code | 60 |

## Tier 5 — worth writing down, not worth building now (40–59)

71 Multi-arm tasks needing two operators · 72 Spectator mode with a follow
camera · 73 Task templates for funders · 74 Corpus licence resale · 75 Operator
reputation weighted by verified runs · 76 Task bounties that escalate with time
unfilled · 77 Scenario editor · 78 Prop marketplace · 79 Trajectory annotation
by third parties · 80 Cross-task skill transfer scoring · 81 Policy leaderboard
by rollout · 82 Corpus subsets by skill · 83 Time-boxed contests · 84 Team
tasks · 85 Operator onboarding tutorial as a task · 86 Mobile teleoperation ·
87 Gamepad support · 88 Haptic feedback · 89 VR viewport · 90 Voice control ·
91 Replay export as video · 92 Embeddable run widget · 93 Public API keys ·
94 Webhooks on payout · 95 Discord bot · 96 Email digests · 97 Push on task
posted · 98 Referral leaderboard · 99 Multi-language interface · 100 Dark-mode
poster variant of the landing

**Refused outright.** Anything that fabricates a demonstration, any leaderboard
of invented operators, any "AI-powered" label on the kinematic scorer, and any
number on the interface that does not come from chain, the database, or a
generated artefact.

---

## The audit that was worth more than the list

Five of the sixteen were not on it. They came from one question asked late:
which write functions do the deployed contracts have that no page in this
interface can call? The answer was eight, and five of them mattered.

| Contract | Function | What it meant |
|---|---|---|
| `CorpusAccess` | `subscribe` | `/api/dataset` has answered 402 since the gate shipped and there was nowhere to pay. The revenue path ended in a status code |
| `AxonProtocolV2` | `createTaskUntil`, `closeTask` | Every task posted through this interface was the kind whose escrow can never come back. The contract has had the other kind all along |
| `TrajectoryCertificate` | `mint` | The run page has said "not minted for this run" since it was written, with no way to mint it |
| `ContributionRecord` | `sync` | Callable by anyone for anyone precisely so an absent operator's record is not left understated — and callable from nowhere. One address was 189.00 points behind |
| `Foundry` | `propose`, `vote`, `execute` | A proposal passed 165.00 to nil, closed, and sat unexecuted. The decision was made and nothing could carry it out |

The three that remain unreachable are correctly so: `ConfidentialPayouts.accrue`
and `CorpusManifest.commit` are restricted to the adder and the verifier, and
`ConfidentialPayouts.registerKey` belongs to a research path with no surface yet.

The same shape produced the largest single find of the day. `lib/abi.ts` was
generated from `AxonProtocol.sol` — version one — while the deployed contract is
`AxonProtocolV2`. Everything kept working, because the app's list is a strict
subset. What it cost was the two fields v2 added to a Task: a tuple decoded
against nine components reads the first nine and drops the rest, so the
interface could not see `expiresAt` or `closed`, and offered a Run button on a
task whose funder had already taken the escrow back.

Every generated file — the ABI, the read interfaces, the selector map — now
comes from the deployed contract's own artifact, by one script.
