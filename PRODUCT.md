# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4, chosen because the surface is a data-dense web app with a realtime 3D viewport and an on-chain write path. Three.js via react-three-fiber for the teleoperation station. Foundry + Solidity for contracts on Monad. Python (numpy + shapely, no CSG booleans) for the parametric robot-arm CAD kernel that exports the GLB the station renders — the same code-generated-geometry approach used in this author's `orchestrator-pad` project.

## Users

**Operators (primary).** Anyone with a browser and no robotics hardware. Students, gamers, crypto-natives, gig workers. They sit down for 20–90 minutes and run manipulation tasks back to back: drive a simulated arm, pick an object, place it in a goal region, submit. The work is repetitive and skill-based — closer to a rhythm game than to data entry — and it pays per accepted run. What they need visible at all times: MON per trajectory, slots remaining, their quality score, elapsed time against the field, and whether the last run was accepted. They will do the same task up to five times and are penalized for sloppy repeats.

**Task funders (secondary).** Robotics teams and model labs who post a task, escrow MON against a slot count, and need coverage: how many scenarios, which manipulation skills, what pass rate, how fast slots are filling.

**Policy licensees (secondary).** Buyers of the trained policy and its dataset. They care about provenance — which trajectories, which contributors, what quality distribution — because that is what they are paying for.

## Product Purpose

Physical AI is bottlenecked by data, not compute. Robot manipulation data is collected today in closed labs: slow, expensive, and too narrow to generalize. Thenar crowdsources it — anyone teleoperates a simulated arm in the browser and every accepted run becomes a training trajectory.

The part that is ours: the economy settles on-chain, per run, in the same transaction that records provenance. Success is an operator finishing a task and seeing MON arrive before they have let go of the mouse, and a policy licence fee fanning out to every contributor who trained it.

## Positioning

Existing crowdsourced robot-data networks anchor a *receipt* on-chain — a data ID bound to a task and a wallet — and keep the money off-chain in fortnightly, non-transferable points redeemable for a possible future airdrop. Thenar settles the money itself: the task is a funded escrow, the accepted trajectory pays out in the same call that records it, and the trained policy is an on-chain asset whose licence revenue routes back to contributors by quality weight in one transaction.

That is only affordable at Monad's throughput. Per-trajectory settlement plus royalty fan-out is several times the state writes of a bare anchor, and those writes are almost entirely independent — different contributors, different tasks, no shared hot state except a slot counter. It is the workload parallel execution exists for.

## Operating Context

The operator's real scene is a laptop, a trackpad or mouse, a browser tab, and often a second tab with the block explorer open. Sessions are long and repetitive. The 3D viewport is the work; everything around it is instrumentation the operator reads without looking away — slot count, timer, latency, frame rate, step checklist, score distribution of everyone else who ran this task.

Tasks carry a fixed vocabulary that must survive into the interface: **scenario** (kitchen, office, bathroom, workshop, home, play, general), **skill** (pick, place, stack, rotate, transfer, arrange, insert, separate, reach), **difficulty** 1–5, **slots** (runs the stage still accepts), **lifecycle** (pre-training → training → post-training). A **trajectory** is the unit of work: a timestamped recording of joint states, gripper state, object poses, and control actions sampled at 20 Hz.

Submitting requires a wallet and a transaction. Many operators will not have one, so first-run cost has to be near zero.

## Capabilities and Constraints

Confirmed and shipping:

- Browser teleoperation of a 7-DoF arm with inverse kinematics, keyboard and pointer control, gripper toggle
- Trajectory recording at 20 Hz, client-side success checking against a goal region, deterministic quality score from success, time efficiency, and path smoothness
- On-chain task bounties with escrowed MON, slot accounting, and a five-runs-per-account cap
- `submitTrajectory` — records CID + hash + score and pays the operator in the same call
- `mintPolicy` — snapshots the contributor cap table, weighted by cumulative quality
- `licensePolicy` — fans a licence payment out to every contributor pro-rata in one transaction
- Portfolio, leaderboard, and a policy market reading directly from chain state
- `PasskeyRegistry` — binds a secp256r1 public key to an address and verifies
  signatures through Monad's P256 precompile at `0x0100` (EIP-7951), so a run
  can be authorised with the curve a passkey uses rather than a seed phrase

Constraints and explicit non-capabilities. These are roadmap and must never be presented as working:

- No MuJoCo-WASM rigid-body physics. The station runs a kinematic simulation with analytic grasping.
- No IsaacSim augmentation, no domain randomization pipeline.
- No trained policy exists. Nothing autonomously attempts a task.
- No post-training / DAgger takeover loop.
- No mobile ego-centric capture.

Networks: Monad Testnet, chain 10143, `https://testnet-rpc.monad.xyz`. Monad Mainnet, chain 143, `https://rpc.monad.xyz`.

## Brand Commitments

Name: **Thenar** — the fiber that carries motor output away from a neuron. Lowercase in body copy, uppercase in the wordmark.

Voice: industrial and exact. Machine-shop plain speech. Numbers instead of adjectives — "1,200 slots, 0.4 MON each, 81% pass rate," never "incredible rewards." No exclamation marks, no "seamless," "revolutionary," "unleash," "supercharge," or "the future of." Labels are imperative and literal: Run, Submit, Sign, Licence. The interface talks like a work order.

Binding anti-references. This product must not look like any of these, which are the defaults this category converges on:

- Near-black canvas with a single acid-green or acid-lime accent — the incumbent's own look, and the most saturated pattern in crypto-robotics
- Purple-to-blue gradient heroes; any gradient used as a surface fill
- Glassmorphism, frosted panels, backdrop blur as decoration
- Italic serif display headlines over a dark hero
- Generic soft drop shadows and uniformly rounded cards; nested card-in-card
- Pulsing status dots, glowing borders, neon outer shadows
- Numbered section labels (01 / 02 / 03) where the content is not genuinely ordered
- Inter, Space Grotesk, or Geist as the display face
- Emoji as section markers or iconography
- Centered marketing layout with everything stacked mid-column
- Left icon-rail navigation copied from every SaaS dashboard

## Evidence on Hand

Real and citable:

- The incumbent network's public figures: 153,157 contributors, 3,954,581 trajectories, 3,569,236 on-chain records, 1,200-slot tasks, 81.54% pass rate on a representative task, 2:05 average completion — used only as market evidence, never as Thenar's own numbers
- Monad network parameters above
- The event's judging rubric, which the build is scoped against

Absent, and never to be fabricated: Thenar has no users, no revenue, no partners, no benchmarks, no trained policy, and no licence sales. Every number rendered in the app must come from live chain state or be visibly labeled as seeded demonstration data. Task names, scenario art, and score distributions shown before real traffic exist are synthetic and must be labeled as such.

## Product Principles

1. **The viewport is the product; everything else is instrumentation.** On the station, the 3D scene leads and the chrome around it is readable without stealing focus. Nothing decorative may compete with the arm.
2. **State the number.** Where a quantity exists — slots, MON, score, latency, rank, pass rate — show the quantity. Adjectives are a failure to measure.
3. **Payment is the feedback.** The moment a run is accepted and paid is the emotional center of the product. It is the one place the interface is allowed to be loud.
4. **Repetition must stay legible.** Operators run the same task five times and dozens of tasks a session. Density, consistency, and low per-run friction beat novelty everywhere outside the payout moment.
5. **Never dress roadmap as capability.** The non-capabilities above are named in the interface as roadmap wherever a visitor could assume otherwise.

## Accessibility & Inclusion

Keyboard is a first-class control path, not a fallback — the station is driven primarily by arrow keys, E/D, Q/W, A/S, Z/X, and space, so every control must carry a visible focus state and a discoverable key legend. The teleoperation loop cannot be the only way to understand the product: the hub, portfolio, leaderboard, and policy market must be fully usable without entering a 3D scene. Motion respects `prefers-reduced-motion`, including the payout moment. Color is never the sole carrier of state — lifecycle, difficulty, and pass/fail each need a shape or a label alongside their hue.
