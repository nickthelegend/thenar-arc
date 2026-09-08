# 100 ideas, ranked

Scored **impact × feasibility × fit** (1–5 each, max 125). Impact = would a judge
notice. Feasibility = buildable for real, here, now. Fit = strengthens the pitch
rather than cluttering it.

The pitch this has to serve: *crowdsourced robot-manipulation data, where the
economy settles on chain per run, and a policy licence fans out to everyone who
trained it.* Ideas that don't sharpen that lose on fit however clever they are.

---

---

## Where all hundred stand

Counted honestly. "Built" means it is live on thenar.io and something other
than my own assertion says so — an assertion in `npm test`, a transaction on
Fuji, or a reading taken from the running page.

| | Count | Which |
|---|---|---|
| **Built and verified** | **66** | 1–25, 27–31, 39–67, 69–74 |
| Built in part | 1 | 75 — sitemap and robots ship; the per-page OG image 404s in production and was reverted rather than left broken |
| Cannot be built as this is deployed | 3 | 26 (task expiry needs a contract change, which would orphan the settled runs), 37 (the contract hands the raw hash to the P-256 precompile; WebCrypto hashes what it signs, so no browser passkey can ever produce a signature it accepts), 38 (gasless first run needs meta-transactions; `submitTrajectory` credits `msg.sender`) |
| Blocked on access I do not have | 5 | 32–36 — ICM, a hosted L1 validator, eERC, Warp, a subnet gas token. No Dispatch/Echo testnet gas and no AvaCloud account |
| Rejected, with the reason stated | 25 | 76–100 |
| | **100** | |

The rejections are part of the work, not a shortfall against it. Half of them —
a points system, leaderboard prize money, AI-written task descriptions, a
trained-policy demo — are rejected because building them would mean putting a
number on screen that nothing backs. In a product whose entire claim is that
you can check the number yourself, that is the one thing worth refusing.

Three things in the "cannot" row were found by trying. The passkey path was
built, tested against the deployed contract, and reverted when the precompile
returned false for the hash the contract passes it — and PRODUCT.md was
corrected, because it had listed that path as shipping.

## Tier 1 — build these (score ≥ 80)

| # | Idea | I | F | Fit | Score |
|---|---|---|---|---|---|
| 1 | **Replay a recorded run in the viewport** — scrub any trajectory from `/run/[hash]`, arm and payload driven by the stored samples. Turns the ledger from a table into evidence. | 5 | 5 | 5 | **125** |
| 2 | **Show the payout the instant it lands** — the run's AVAX arrives as a counted-up figure with the tx link, on the frame the receipt returns. The product's own Principle 3. | 5 | 4 | 5 | **100** |
| 3 | **Score breakdown as a live gauge during the run**, not after: placement/smoothness/efficiency each moving as you drive. | 4 | 5 | 5 | **100** |
| 4 | **Ghost the best run on this task** while you drive, so you are racing a real trajectory. | 5 | 4 | 5 | **100** |
| 5 | **Dataset preview before licensing** — a buyer sees episode count, score distribution, contributor spread and a sample trajectory before paying. | 4 | 5 | 5 | **100** |
| 6 | **One-click "verify this payout"** — re-derive the trajectory hash in the browser from the downloaded samples and show it matching the chain. | 5 | 4 | 5 | **100** |
| 7 | **Per-run cost readout** — gas actually paid vs AVAX earned, per run, from receipts. Nobody shows the operator their margin. | 4 | 5 | 4 | 80 |
| 8 | **Task funder dashboard** — fill rate, score distribution, cost per accepted trajectory, coverage by skill and room. | 4 | 4 | 5 | 80 |
| 9 | **Keyboard-only run** — complete a whole run without a pointer, with a visible focus path. Accessibility claim made real. | 4 | 5 | 4 | 80 |
| 10 | **Failure is legible** — when a run scores below the pay threshold, say which term lost it and by how much. | 4 | 5 | 4 | 80 |

## Tier 2 — strong, build if time (60–79)

| # | Idea | Score |
|---|---|---|
| 11 | Trajectory diff: two runs on one task, overlaid | 75 |
| 12 | Live "someone just got paid" ticker on the landing page, from chain | 75 |
| 13 | Per-contributor royalty projection — what a licence would pay *you* | 75 |
| 14 | Score histogram per task, drawn from real runs | 72 |
| 15 | Undo the last grasp within a run, at a scoring penalty | 70 |
| 16 | Export a single run as a LeRobot episode, not just the whole task | 70 |
| 17 | Task templates — clone an existing task's scene and economics | 68 |
| 18 | Slot-fill projection: at the current rate, this task fills in N hours | 68 |
| 19 | Operator streak and session stats, from chain | 66 |
| 20 | Warm-up mode — an unscored, unpaid run to learn the controls | 65 |
| 21 | Payload variety within one task (same skill, different object) | 65 |
| 22 | Contributor page: everything one address has recorded | 64 |
| 23 | Licence receipt page — what a buyer bought, and who was paid | 64 |
| 24 | Difficulty derived from real pass rate, not the funder's guess | 62 |
| 25 | Multi-object scenes — two payloads, ordered placement | 62 |
| 26 | Task expiry and escrow refund to the funder | 60 |
| 27 | Trajectory integrity badge everywhere a hash is shown | 60 |
| 28 | "Why did this fail" replay — the frame where the payload was dropped | 60 |

## Tier 3 — Avalanche depth (the track's own axis)

| # | Idea | Score |
|---|---|---|
| 29 | Glacier-backed leaderboard, removing the DB from another public surface | 60 |
| 30 | Glacier-backed task history, so a task's provenance survives us | 58 |
| 31 | Contract event feed rendered from Glacier rather than RPC polling | 56 |
| 32 | ICM: announce a minted policy to a second chain | 45 (blocked: no L1 gas) |
| 33 | Thenar L1 with a fee manager so a first run costs nothing | 40 (blocked: needs a hosted validator) |
| 34 | eERC confidential contributor payouts | 35 (blocked) |
| 35 | Avalanche Warp receipts for cross-chain licence proof | 35 (blocked) |
| 36 | Subnet-native gas token for operator rewards | 30 (blocked) |
| 37 | Passkey-authorised run submission end to end (registry already ships) | 58 |
| 38 | Gasless first run via a relayer paying on the operator's behalf | 52 |
| 39 | Snowtrace deep links on every hash, everywhere | 55 |
| 40 | Chain-health banner when the RPC degrades | 54 |

## Tier 4 — design and motion

| # | Idea | Score |
|---|---|---|
| 41 | Payout moment: the figure counts, the rule draws, the row lands | 72 |
| 42 | The datum circle tightens as the payload nears tolerance | 70 |
| 43 | Tool trail fades by age, so recent motion reads brightest | 66 |
| 44 | Score dial that settles like a needle, not a progress bar | 65 |
| 45 | Task card hover reveals the actual scene, not a label | 64 |
| 46 | Slot tally fills as a physical counter | 60 |
| 47 | Arm idles with a slow breathing pose when not driven | 58 |
| 48 | Room lighting shifts per scenario (kitchen warm, workshop cool) | 58 |
| 49 | The rule under the hero draws itself once, on first paint | 56 |
| 50 | Leaderboard rank change animates the delta | 55 |
| 51 | Loading state that draws the arm assembling itself | 54 |
| 52 | Grasp feedback: jaws flash at the moment of capture | 54 |
| 53 | Out-of-reach envelope pulses only on the axis being violated | 52 |
| 54 | Foundry cap table as a real weighted bar, not a list | 52 |
| 55 | Cursor becomes a crosshair inside the workspace | 50 |
| 56 | Sound: a single click on grasp, one on release (opt in) | 48 |
| 57 | Print stylesheet so a task sheet prints as a work order | 46 |
| 58 | Reduced-motion path for the payout moment, already partly there | 45 |
| 59 | Scene thumbnail on the task card generated from the real GLBs | 60 |
| 60 | Motion on the archive page marking it as past, not present | 42 |

## Tier 5 — production readiness

| # | Idea | Score |
|---|---|---|
| 61 | Offline banner and queued submission when the network drops | 62 |
| 62 | Resume an interrupted run rather than losing it | 60 |
| 63 | Explicit "wrong network" recovery with a one-click switch | 60 |
| 64 | Rate-limit the props upload endpoint | 58 |
| 65 | Idempotency key on submit, so a double-click cannot double-pay | 58 |
| 66 | Structured server logs with a request id | 55 |
| 67 | `/api/health` surfaced as a status page | 54 |
| 68 | Postgres instead of one SQLite file | 54 |
| 69 | Verifier key in a private service on the internal network | 52 |
| 70 | Backup restore drill, scripted and documented | 52 |
| 71 | Graceful degradation when Glacier is down (already partly) | 50 |
| 72 | E2E test suite in CI, not just a manual plan | 50 |
| 73 | Error boundary per surface, not per app | 48 |
| 74 | Content-Security-Policy headers | 46 |
| 75 | Sitemap and per-page OG images | 44 |

## Tier 6 — considered and rejected, with the reason

| # | Idea | Why not |
|---|---|---|
| 76 | Token / points system | Directly contradicts the pitch: settling real money is the differentiator |
| 77 | Leaderboard prizes | Invents an economy the contract does not have |
| 78 | AI-generated task descriptions | Fabricates content in a product whose claim is verifiability |
| 79 | Social feed / comments | Clutter; nothing to do with data collection |
| 80 | Mobile ego-centric capture | Named as a non-capability; would be dressing roadmap as feature |
| 81 | Trained policy demo | There is no trained policy; showing one would be a lie |
| 82 | Physics via MuJoCo WASM | Genuinely valuable, genuinely not a same-day build |
| 83 | Multi-arm bimanual tasks | Kinematics rewrite |
| 84 | VR / WebXR station | Impressive, but splits the demo's attention |
| 85 | Voice control | Novelty; hurts a precision task |
| 86 | NFT per trajectory | Contradicts the corpus-as-asset model |
| 87 | DAO governance | No constituency yet |
| 88 | Referral programme | Growth theatre with no users |
| 89 | Achievement badges | Gamification that competes with the payout moment |
| 90 | Dark/light theme toggle | The design world is deliberately single-theme |
| 91 | Onboarding carousel | The product explains itself; a carousel delays it |
| 92 | Chatbot helper | Nothing here needs conversation |
| 93 | Email notifications | No accounts, no addresses |
| 94 | Team accounts | No demand |
| 95 | Subscription pricing | The contract prices per licence |
| 96 | Public API keys | Everything is already public on chain |
| 97 | Mobile app | The browser claim is the point |
| 98 | Localisation | Premature |
| 99 | Blog / changelog | Not the demo |
| 100 | Analytics tracking | Privacy cost, no benefit to a judge |
