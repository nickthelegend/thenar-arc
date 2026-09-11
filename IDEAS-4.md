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

## Tier 1 — build these (95+)

Two corrections made before building, under this list's own scoring rule: #1 and
#2 assumed a judge could reach the L1. They cannot — it is local-only. Their
impact stands and their feasibility does not, so **#3 is the top buildable
item**, and it is the one that carries the L1 story to somebody with a browser.

| # | Idea | Score | Why |
|---|---|---|---|
| 1 | **Zero-gas run on the L1, shown side by side.** The station offers Fuji or the L1. On the L1 the fee manager puts the operator's cost at zero and the page prints both numbers. | ~~125~~ **60** | Impact is real; feasibility is not. The L1 runs on 127.0.0.1 — a judge opening thenar.io cannot reach it, and hosting a validated L1 is not a change to this repository. Demoted on the honesty rule this list is scored by |
| 2 | **Pay the operator in the gas token they spend.** On the L1, `submitTrajectory` pays THN, which is also the gas. | ~~120~~ **60** | Same wall as #1, and for the same reason |
| 3 | **The L1 proof, on the site.** `/l1` renders `docs/l1-proof.txt` as three checkable claims with the chain IDs and block numbers. | 120 | Turns a local script into something a judge can read without a terminal |
| 4 | **Cross-chain policy receipt in the product.** The ICM delivery that claim 32 proves, surfaced on `/licence` as "announced to chain X at block N". | 115 | The Warp/ICM story stops being a contract nobody sees |
| 5 | **First-run cost, stated on the station.** 460,466–600,000 gas measured; print what this run will cost before it is submitted. | 110 | Honesty as a feature, and it sets up the L1 answer |
| 6 | **Run-to-run improvement.** An operator's five runs on a task, scored against each other, with the delta named. | 110 | The repetition loop finally has a narrative |
| 7 | **Session summary.** On leaving the station: runs, accepted, earned, best score, time. | 105 | Every operator sees it; costs nothing to compute |
| 8 | **Empty-corpus buyer view.** `/corpus` when a task has no trainable episodes says so and why, rather than rendering zeros. | 105 | The unglamorous finish that separates done from demoed |
| 9 | **Task authoring preflight.** `/post` shows the escrow, the per-run reward and the total before signing. | 100 | Funders are half the market and the flow is currently blind |
| 10 | **Failure taxonomy on the run page.** Which of the four failure modes this run hit, named. | 100 | Turns a low score into a lesson |

## Tier 2 — build if the top ten land (80–94)

| # | Idea | Score |
|---|---|---|
| 11 | Personal best marker in the viewport, ghosted against the current run | 94 |
| 12 | Operator streak: consecutive accepted runs, on the profile | 92 |
| 13 | "What would have paid" — the score needed to clear the floor, on a rejected run | 92 |
| 14 | Corpus diff: what a licence buys today versus last week | 90 |
| 15 | Task difficulty calibrated from real pass rates rather than declared | 90 |
| 16 | Live slot pressure: how fast a task is filling, on the hub | 88 |
| 17 | Reward-per-minute, computed from par and payout, on every task row | 88 |
| 18 | Warp message decoder on `/licence` — payload rendered as fields | 86 |
| 19 | Contract call log: every write this deployment has made, with its cost | 86 |
| 20 | Operator's own gas spend against earnings, on the portfolio | 85 |
| 21 | Prop provenance: which runs used which uploaded prop | 84 |
| 22 | Referral link with its claim state, on the portfolio | 84 |
| 23 | Foundry treasury vote UI, on `/contracts` | 83 |
| 24 | Prize pool entry from the task it funds | 83 |
| 25 | Trajectory certificate mint, from the run page | 82 |
| 26 | Corpus subscription purchase flow | 82 |
| 27 | Task expiry and escrow refund, surfaced | 81 |
| 28 | Per-scenario pass rates on `/spec` | 80 |
| 29 | Score distribution histogram per task | 80 |
| 30 | The datum circle drawn to scale on the task page | 80 |

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
| 45 | The theme toggle animates the ground rather than snapping | 72 |
| 46 | Reject state hatches rather than reddens, matching the tolerance band | 71 |
| 47 | Hover on a leaderboard row ghosts that operator's best path | 71 |
| 48 | The nav's active item is a drawn underline that slides | 70 |
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
| 59 | RPC failover to a second endpoint | 65 |
| 60 | Wallet-disconnect mid-run handled without losing the recording | 64 |
| 61 | Browser-back during a run warns before discarding | 64 |
| 62 | Offline queue: a run recorded offline submits when the network returns | 63 |
| 63 | Storage-blocked browsers degrade to session-only | 63 |
| 64 | WebGL-unavailable fallback that still explains the product | 62 |
| 65 | Slow-RPC banner distinct from the offline banner | 62 |
| 66 | Duplicate-tab detection on the station | 61 |
| 67 | Clock-skew detection against block timestamps | 61 |
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
