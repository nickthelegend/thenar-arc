# 100 ideas, ranked

Scored `impact × feasibility × fit`. Impact = would a Blitz judge notice.
Feasibility = buildable for real in the hours left. Fit = strengthens the
pitch rather than cluttering it. Tiers, not a strict 1–100 ordering inside a
tier. Build status is tracked in the final report, not here.

## Tier 1 — the demo lives or dies on these

| # | Idea | Why it ranks here |
| --- | --- | --- |
| 1 | AxonProtocol deployed on Monad testnet, verified on the explorer | 50 rubric points sit on this alone |
| 2 | `submitTrajectory` records provenance **and** pays in one call | The entire thesis, in one transaction |
| 3 | EIP-712 verifier-signed scores | Without it the operator mints their own payout; this is what makes it credible |
| 4 | Real persisted database for trajectories | "No memory that resets" — and the CID has to resolve to something |
| 5 | Wallet connect + real signed tx from the browser | The live on-chain transaction during the demo |
| 6 | Hub reads live task state from the contract | Proves the chain is the source of truth, not a fixture |
| 7 | `mintPolicy` snapshotting a weighted contributor cap table | The differentiator nobody else in the room will have |
| 8 | `licensePolicy` fanning out to every contributor in one tx | The closing frame of the pitch |
| 9 | Full tx error handling: rejection, insufficient funds, decoded reverts | The difference between finished and demo-ware |
| 10 | Explorer deep links on every hash | Judges click these |
| 11 | Portfolio reading real on-chain run history | Closes the loop the operator cares about |
| 12 | Leaderboard from real contract state | Same |
| 13 | Payout counter that counts up in brass on settle | The one moment a judge remembers |
| 14 | Trajectory replay in 3D from stored data | Proves the data is real, not a score in a database |
| 15 | Parallel-execution demo: N concurrent submits landing together | The Monad-specific argument, made visible |

## Tier 2 — strong, clearly worth the time

| # | Idea | Note |
| --- | --- | --- |
| 16 | Task creation UI with real escrow | Turns it from an app into a marketplace |
| 17 | Live activity feed from contract events | Makes the network feel alive |
| 18 | Public "verify this run" page recomputing the score from stored data | Anyone can audit a payout |
| 19 | `/api/contract` exposing address + ABI + chain | Judges and other builders can poke it |
| 20 | Wrong-network detection and one-click switch | Everyone hits this |
| 21 | Low-balance warning with faucet link | Everyone hits this too |
| 22 | Batch-submit held runs in one transaction | Uses the throughput argument again |
| 23 | Tolerance-band mark springing to its measured position | Motion that carries meaning |
| 24 | Slot tally ticking one segment on a successful submit | Ties the UI to chain state |
| 25 | Trajectory scrub bar over a recorded run | Turns replay into an instrument |
| 26 | Ghost trail of the tool path in 3D | Shows what "smoothness" actually measures |
| 27 | Reach-envelope ring drawn when a target is out of reach | Fixes the one confusing moment in teleop |
| 28 | Score reveal: components tally, then the total stamps | Choreography, not decoration |
| 29 | Empty states for every list, in the product's voice | Unglamorous, very visible |
| 30 | Error boundary with real recovery | Same |
| 31 | 404 built in the world | Same |
| 32 | Gas cost of a submit shown in the UI | Cheap, and it makes the Monad point numerically |
| 33 | Block height + 1s block time indicator wired to real RPC | Ambient proof of the network |
| 34 | Live tx status strip (pending → mined) with elapsed ms | Shows off 1s blocks |
| 35 | Task detail page with the real submission history | Depth |
| 36 | Cursor becomes a crosshair over the viewport | Small, memorable |
| 37 | THENAR-6 spec sheet page from the real CAD constants | Nobody else will have generated their robot |
| 38 | Dataset export for a filled task (LIBERO-shaped JSON) | Makes "data foundry" concrete |
| 39 | Per-run certificate page, printable | Judges screenshot these |
| 40 | Aria-live tx announcements + focus management | Real accessibility, not a checkbox |

## Tier 3 — good, build if the clock allows

41 Operator profile pages · 42 Search across tasks · 43 Task filters persisted to
the URL · 44 Sort by expected value per minute · 45 Near-duplicate trajectory
rejection · 46 Session streak tracking · 47 Badges from real thresholds ·
48 Referral attribution · 49 Funder view: top up escrow · 50 Funder view:
withdraw unspent escrow · 51 Slot reservation so the last slot cannot race ·
52 Multicall for all reads in one round trip · 53 Event-sourced indexer polling
logs into the DB · 54 WebSocket block subscription · 55 Nonce management for
rapid submits · 56 Retry with backoff on RPC failure · 57 RPC-down banner ·
58 Health endpoint · 59 Rate limiting on the verifier · 60 Trajectory size cap
and schema validation server-side · 61 Idempotent submit · 62 Structured
logging · 63 Optimistic UI with rollback · 64 Number roll on every changing
figure · 65 Loading states as a calibration sweep · 66 Hatched skeletons ·
67 Toast system as a work-order strip · 68 Page transitions like a machine
indexing · 69 Camera dolly on run start · 70 Arm idle micro-settle ·
71 Datum-circle response when the payload enters tolerance · 72 Jaw-state pulse
in the UI · 73 Task row hover revealing a score distribution · 74 OG image per
task · 75 Favicon and app icons · 76 SEO metadata per route · 77 Print
stylesheet · 78 Reduced-motion honoured in the 3D scenes · 79 Keyboard-only
navigation of the whole app · 80 One-command setup verified from a clean clone

## Tier 4 — deliberately not this build

81 Post-training / DAgger takeover loop · 82 An actually trained policy ·
83 Bimanual second embodiment · 84 MuJoCo-WASM rigid-body physics ·
85 IsaacSim domain randomisation · 86 Mobile ego-centric capture ·
87 Gasless relayer / sponsored transactions · 88 Embedded email wallets ·
89 Sign-in with Ethereum sessions · 90 Mainnet deployment · 91 Sound design ·
92 Scroll-linked arm pose on the landing · 93 Difficulty auto-calibration from
live pass rates · 94 IPFS pinning of trajectories · 95 Zero-knowledge proof of
score correctness · 96 Subgraph indexer · 97 Multi-language copy ·
98 Team/org accounts · 99 Dispute resolution for rejected runs ·
100 Secondary market for policy licences

Tier 4 is not a wish list to pad the count — each is a real, scoped idea that
was ranked and cut. They lose on feasibility (82–85, 95, 96), on fit (97–100
add surface without strengthening the pitch), or because they need a credential
or spend that this build does not have (87, 90, 94).
