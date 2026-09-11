# Demo — the five-step loop, cold

Written to be run in front of someone, from a browser that has never seen this
site, with no wallet and nothing cached. Every step ends on something checkable
by the person watching rather than on a claim.

Rehearsed against the live deployment on 3 Sep 2026: **22.8 seconds** across six
steps, zero console errors. `node scripts/demo-rehearse.mjs` re-runs and re-times
it, and fails if anything logs an error.

---

## Before you start

Open a private window. That is the whole setup — there is nothing to install, no
wallet to connect, and no faucet to visit for anything in this script.

If you want the paid step live rather than verified from history, you need an
address with Fuji AVAX; the faucet is at https://core.app/tools/testnet-faucet/.
The script below does not depend on it.

---

## 1 — Land · ~4s

**https://thenar.io**

The claim is one sentence: physical AI is short of data, not compute. Under it,
five figures read from the contract every six seconds — tasks, trajectories,
policies, open slots, escrow — and the contract's own address beside them.

> Point at the readings. They are not decoration: the same numbers come back
> from `taskCount()`, `trajectoryCount()` and `policyCount()` if anyone calls
> them.

## 2 — Open the work · ~6s

**Find a task** → `/hub`

Every row is read from chain: escrow, reward per run, slots filled, par time,
difficulty. The strip above the filters describes the whole board, so it does
not move when the filters do.

> "Every task here was funded by us" is on the page. No third party has funded
> one, and the interface says so rather than implying demand.

## 3 — Drive it, with no wallet · ~7s

**Run** on any task → `/station/1`

A six-axis arm, generated from a parametric Python kernel, not downloaded. Drag
to move the tool; W/S reach, A/D swing, E/Q raise, space for the jaws.

**Practise first — no wallet, no slot used.** Do that. The run records and
scores without a wallet and without consuming a slot.

> The scoring panel says what this simulation is: inverse kinematics and
> analytic grasping, no contact simulation. It also says every recorded run is
> afterwards integrated under rigid-body dynamics and the difference published.
> That is the claim this product will not overstate.

## 4 — Be paid in the same transaction · instant to verify

With a funded wallet, **Submit** writes the trajectory hash, its task, the
address and the verified score, and transfers the AVAX — one call, no separate
signing step.

Without one, show it from history: `/leaderboard` or `/api/feed` lists runs that
were paid. The most recent on chain paid **0.00072432 AVAX**.

> The score is not the operator's to choose. The server recomputes it from the
> samples and signs it; the contract refuses a score it did not sign. `/api/verify`
> ignores a `score` field in the request — hand it 10000 and it still scores the
> recording.

## 5 — Verify it as a stranger · ~1s

Take any `tx_hash` from `/api/feed` and open it on **testnet.snowtrace.io**.

Rehearsed example: `0x3d82ea92bb…` — status success, block 58100366.

> Nothing about that page comes from us. It is the chain's own record of the
> payout, and it resolves whether or not this deployment is running.

## 6 — Everything else is inspectable · ~5s

**https://thenar.io/contracts**

Eleven deployed contracts and one superseded, each with its address, code size,
balance, source path and the surface that uses it — plus live readings from the
ones with state. Two are Avalanche-specific and named as such: **LicenceReceipt**
attests a policy as a Warp message signed by this subnet's validators, and
**ConfidentialPayouts** adds earnings under ElGamal without the chain holding the
number.

> The superseded v1 is listed too, with 0.263 AVAX marked stuck and why.

---

## What not to claim

All of this is in `/spec` under "What this is not", and saying it out loud is
better than being asked:

- The station is kinematic. There is no contact simulation.
- No trained policy exists. A minted policy is a cap table over the trajectories
  that would train one.
- No domain randomisation, no DAgger loop, no mobile capture.
- Passkeys register, prove and revoke on chain. Authorising a *run* with one does
  not work as deployed, and the reason is written down.

## Numbers worth having ready

| | |
|---|---|
| On chain | 6 tasks · 9 trajectories · 1 policy · 0.017447 AVAX escrowed |
| Corpus | 104 trajectories stored · 3 props · 22.8 MB snapshot, checksummed daily |
| Gas per run | 460,466–600,000, measured from real receipts |
| Cost at 25 gwei | 0.015 AVAX to earn 0.001 — the case for a zero-gas L1 |
| Contracts | 12 deployed, all Sourcify `exact_match` |
| Tests | 57 unit · 72 e2e · 108 contract · 8 registry · plan runners in CI |
