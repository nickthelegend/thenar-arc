# 100 more ideas — round two

Everything already shipped is excluded. Ranked `impact × feasibility × fit`,
with the gas budget as a hard constraint: the deployer holds **0.17 MON**, so
anything needing a contract redeploy is out unless it is worth the whole
budget.

## Tier 1 — build now

| # | Idea | Why |
| --- | --- | --- |
| 1 | **Passkey verification through the P256 precompile**, as its own deployed contract and a page that proves it live | The one capability Monad has and Ethereum does not. Verified working; unused. |
| 2 | **Ghost trail of the tool path in 3D during a run** | Makes the smoothness term visible instead of abstract |
| 3 | **Reach envelope drawn when a target is unreachable** | Fixes the one genuinely confusing moment in teleop |
| 4 | **Gas estimate shown before the operator commits** | Turns Monad's reserve rule from a surprise into information |
| 5 | **Copy-to-clipboard on every hash and address** | Judges copy things; nothing is copyable today |
| 6 | **Keyboard help overlay on `?`** | The station is keyboard-driven and has no discoverable help |
| 7 | **Shareable filter state in the URL** | A judge can be sent straight to a filtered hub |
| 8 | **Practice mode — run without submitting** | Lets anyone try it with no wallet at all |
| 9 | **WebGL context-loss recovery** | The 3D scene dies silently today; I hit this during the build |
| 10 | **Double-submit prevention** | One stray double-click currently sends two transactions |
| 11 | **`aria-live` for transaction status** | The whole submit flow is invisible to a screen reader |
| 12 | **Toast strip in the product's voice** | There is no non-blocking feedback channel anywhere |
| 13 | **Per-task personal best, with "beat this"** | Turns a task list into something with a target |
| 14 | **Session summary when you leave the station** | Closes the loop on a session instead of just stopping |
| 15 | **`robots.txt`, `sitemap.xml`, web manifest** | Unglamorous, instantly visible as missing |

## Tier 2 — strong, build if the clock allows

16 Dynamic OG image per task · 17 Datum ring responds when the payload enters
tolerance · 18 Slot tally flashes the segment your run filled · 19 Tolerance
marker springs to position · 20 Score components tally then the total stamps ·
21 Crosshair cursor over the viewport · 22 Arm idle micro-sway · 23 Camera
dolly on run start · 24 Number roll on changing figures · 25 Skeleton shimmer
sweep · 26 Rank-change animation on the leaderboard · 27 Cap-table bars grow on
mount · 28 Command palette (⌘K) · 29 Deep-link a scrub position on a run ·
30 Single-run JSON export · 31 Run comparison against the task's best ·
32 Expected value per minute as a sort · 33 Task watchlist · 34 Streak across
days · 35 Stale-data indicator when polling fails · 36 RPC failover to a second
endpoint · 37 Offline banner · 38 Retry on every error state · 39 Wallet
disconnect mid-run · 40 Chain switch mid-run · 41 Browser back during a run ·
42 Tab-away pause · 43 Low-FPS warning · 44 Sample-cap warning on a long run ·
45 Request id surfaced on API errors

## Tier 3 — real, lower leverage

46 Live gas-price indicator · 47 Block-cadence histogram from real blocks ·
48 Multicall batching counter (N reads → 1 request) · 49 Calldata decoder for
your own submit · 50 Contract storage viewer · 51 Reserve-balance calculator ·
52 Bytecode size against the 128 KB limit · 53 Architecture diagram page ·
54 Public API docs page · 55 Comparison table vs anchor-only networks ·
56 Roadmap page · 57 Changelog · 58 Press kit · 59 QR to the live app ·
60 Projector stats ticker · 61 Print stylesheet for a run certificate ·
62 High-contrast mode · 63 Reduced-data mode · 64 Landmark roles ·
65 Focus management on overlay open · 66 Per-surface error boundaries ·
67 Structured server logging · 68 Security headers · 69 Privacy note ·
70 Health check in CI · 71 Seed script for a fresh contract · 72 Compose file ·
73 One-command demo reset · 74 Judge mode with seeded state · 75 Embeddable
task card

## Tier 4 — ranked and cut

76 3D replay of a stored run in the viewport (the 2D path already carries it) ·
77 Scroll-linked hero pose · 78 Page-transition wipe · 79 Sound design ·
80 Undo last keypress · 81 Practice leaderboard · 82 Team page · 83 i18n ·
84 Email notifications · 85 Discord webhook · 86 Referral links · 87 Task
templates · 88 Bulk task posting · 89 CSV export · 90 Grafana dashboard ·
91 Subgraph · 92 Mobile teleop controls · 93 Gamepad support · 94 VR viewport ·
95 Multi-arm scenes · 96 Physics-accurate grasping · 97 Trained policy ·
98 DAgger takeover · 99 Mainnet deploy (spends real money) · 100 Custom domain
(spends real money)

Tier 4 is cut on redundancy (76, 81), scope (92–98), or because it spends real
money (99, 100) — not to pad the count.
