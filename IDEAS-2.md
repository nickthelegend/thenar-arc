# 100 more ideas — round two, with disposition

Everything already shipped is excluded. Ranked `impact × feasibility × fit`.
Gas was the binding constraint: the deployer held **0.17 MON** at the start and
**0.084 MON** at the end, so exactly one contract deploy was affordable and it
went to the highest-value item.

**9 of the 100 ideas were built and verified** (delivered as 12 artifacts —
#15 alone is three files). Every other item carries its own reason below.

Reason codes: `time` reachable but the run ended · `redundant` already covered
by something shipped · `gas` needs on-chain spend beyond the remaining budget ·
`scope` too large to land honestly here · `money` spends real money ·
`clutter` would weaken the demo rather than strengthen it.

## Tier 1 — the ones worth the run

| # | Idea | Status | Note |
| --- | --- | --- | --- |
| 1 | Passkey verification through the P256 precompile | **BUILT** | Contract deployed + fork-tested + live page |
| 2 | Ghost trail of the tool path in 3D | **BUILT** | Draws the line the smoothness term scores |
| 3 | Reach envelope when a target is unreachable | **BUILT** | Verified triggering on OUT OF REACH |
| 4 | Gas estimate before the operator commits | skipped · time | Gas is already shown after settle; the pre-flight estimate is the missing half |
| 5 | Copy-to-clipboard on hashes and addresses | **BUILT** | `Copyable`, wired to run + passkey pages |
| 6 | Keyboard help overlay on `?` | **BUILT** | Verified open on `?`, close on Escape |
| 7 | Shareable filter state in the URL | skipped · time | Straightforward; nothing blocked it but the clock |
| 8 | Practice mode | skipped · redundant | Running without a wallet is already the default path |
| 9 | WebGL context-loss recovery | **BUILT** | Previously a black rectangle with no error |
| 10 | Double-submit prevention | **BUILT** | Each click was a real transaction |
| 11 | `aria-live` for transaction status | **BUILT** | Verified `role="status"` present |
| 12 | Toast strip in the product's voice | skipped · time | No non-blocking feedback channel exists yet |
| 13 | Per-task personal best with "beat this" | skipped · time | Needs a per-address per-task query the UI does not do yet |
| 14 | Session summary on leaving the station | skipped · time | |
| 15 | `robots.txt`, sitemap, web manifest | **BUILT** | All three live, sitemap carries 8 URLs |

## Tier 2 — strong, none reached

All 30 skipped for the same reason unless noted: the run ended before them.

| # | Idea | Status |
| --- | --- | --- |
| 16 | Dynamic OG image per task | skipped · time |
| 17 | Datum ring responds when the payload enters tolerance | skipped · time |
| 18 | Slot tally flashes the segment your run filled | skipped · time |
| 19 | Tolerance marker springs to position | skipped · time |
| 20 | Score components tally, then the total stamps | skipped · time |
| 21 | Crosshair cursor over the viewport | skipped · time |
| 22 | Arm idle micro-sway | skipped · time |
| 23 | Camera dolly on run start | skipped · clutter — competes with the payout moment |
| 24 | Number roll on changing figures | skipped · redundant — `CountUp` already does this where it matters |
| 25 | Skeleton shimmer sweep | skipped · time |
| 26 | Rank-change animation on the leaderboard | skipped · time |
| 27 | Cap-table bars grow on mount | skipped · time |
| 28 | Command palette (⌘K) | skipped · clutter — ten routes do not need one |
| 29 | Deep-link a scrub position on a run | skipped · time |
| 30 | Single-run JSON export | skipped · redundant — `/api/dataset` already exports per task |
| 31 | Run comparison against the task's best | skipped · time |
| 32 | Expected value per minute as a sort | skipped · time |
| 33 | Task watchlist | skipped · clutter — local-only state in an on-chain product |
| 34 | Streak across days | skipped · time |
| 35 | Stale-data indicator when polling fails | skipped · time |
| 36 | RPC failover to a second endpoint | skipped · time — real value, wagmi supports `fallback()` |
| 37 | Offline banner | skipped · time |
| 38 | Retry on every error state | skipped · redundant — hub, portfolio and task pages already have one |
| 39 | Wallet disconnect mid-run | skipped · time |
| 40 | Chain switch mid-run | skipped · time |
| 41 | Browser back during a run | skipped · time |
| 42 | Tab-away pause | skipped · time |
| 43 | Low-FPS warning | skipped · time |
| 44 | Sample-cap warning on a long run | skipped · redundant — the server already rejects over 12,000 samples |
| 45 | Request id surfaced on API errors | skipped · time |

## Tier 3 — real, lower leverage, none reached

| # | Idea | Status |
| --- | --- | --- |
| 46 | Live gas-price indicator | skipped · time |
| 47 | Block-cadence histogram from real blocks | skipped · time |
| 48 | Multicall batching counter | skipped · time |
| 49 | Calldata decoder for your own submit | skipped · time |
| 50 | Contract storage viewer | skipped · clutter — an explorer already does this |
| 51 | Reserve-balance calculator | skipped · redundant — the station already warns below the floor |
| 52 | Bytecode size against the 128 KB limit | skipped · time |
| 53 | Architecture diagram page | skipped · time |
| 54 | Public API docs page | skipped · redundant — `/api/contract` serves the ABI |
| 55 | Comparison table vs anchor-only networks | skipped · redundant — the landing argues this in prose |
| 56 | Roadmap page | skipped · clutter |
| 57 | Changelog | skipped · redundant — 30 commits carry it |
| 58 | Press kit | skipped · clutter |
| 59 | QR to the live app | skipped · time |
| 60 | Projector stats ticker | skipped · time |
| 61 | Print stylesheet for a run certificate | skipped · time |
| 62 | High-contrast mode | skipped · time |
| 63 | Reduced-data mode | skipped · time |
| 64 | Landmark roles | skipped · time |
| 65 | Focus management on overlay open | skipped · time — the one real accessibility gap left |
| 66 | Per-surface error boundaries | skipped · redundant — `app/error.tsx` covers the tree |
| 67 | Structured server logging | skipped · time |
| 68 | Security headers | skipped · time |
| 69 | Privacy note | skipped · time |
| 70 | Health check in CI | skipped · redundant — `/api/health` exists, no CI to wire it to |
| 71 | Seed script for a fresh contract | skipped · redundant — `Deploy.s.sol` seeds eight tasks |
| 72 | Compose file | skipped · scope |
| 73 | One-command demo reset | skipped · gas — reseeding means new funded tasks |
| 74 | Judge mode with seeded state | skipped · gas — same reason |
| 75 | Embeddable task card | skipped · clutter |

## Tier 4 — ranked and deliberately cut

| # | Idea | Status |
| --- | --- | --- |
| 76 | 3D replay of a stored run in the viewport | cut · redundant — the 2D path and scrub already carry it |
| 77 | Scroll-linked hero pose | cut · clutter — fights the idle cycle |
| 78 | Page-transition wipe | cut · clutter |
| 79 | Sound design | cut · clutter — hostile in a demo room |
| 80 | Undo last keypress | cut · redundant — "Run again" is the undo |
| 81 | Practice leaderboard | cut · redundant with #8 |
| 82 | Team page | cut · clutter |
| 83 | i18n | cut · scope |
| 84 | Email notifications | cut · scope — needs a mail credential that does not exist |
| 85 | Discord webhook | cut · scope — needs a webhook URL that does not exist |
| 86 | Referral links | cut · scope |
| 87 | Task templates | cut · clutter |
| 88 | Bulk task posting | cut · gas |
| 89 | CSV export | cut · redundant with the JSON dataset export |
| 90 | Grafana dashboard | cut · scope |
| 91 | Subgraph | cut · scope — and Multicall3 already solved the read problem |
| 92 | Mobile teleop controls | cut · scope |
| 93 | Gamepad support | cut · scope |
| 94 | VR viewport | cut · scope |
| 95 | Multi-arm scenes | cut · scope — needs a second CAD embodiment |
| 96 | Physics-accurate grasping | cut · scope — this is MuJoCo-WASM |
| 97 | Trained policy | cut · scope |
| 98 | DAgger takeover loop | cut · scope — depends on #97 |
| 99 | Mainnet deploy | cut · money |
| 100 | Custom domain | cut · money |
