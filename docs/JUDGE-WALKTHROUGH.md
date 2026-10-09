# Judge walkthrough (about two minutes)

Thenar pays people to teach robots, per run, in USDC on Arc, and sells what they record to AI agents over x402.
Everything below needs nothing but a browser, except the live-money steps, which run on a local Arc fork or, once
deployed, on Arc.

## 0. Zero setup (30 seconds): no wallet, no keys

Open the app (a build with no environment variables set loads fine; sign-in then reads "unavailable").

1. `/` then `/hub`: the open tasks, their USDC bounties and how many slots are left.
2. `/station/0`: drive the simulated SO-101 arm in the browser (W/A/S/D move, E/Q lift, Space the jaws). Practice runs
   are scored without a wallet, so you can see the replay and score.
3. `/arc`: every Arc piece Thenar uses (USDC gas, x402, ERC-8004, Memo, CCTP, CCIP, passkeys) with its contract, a live
   reading where one exists, and how it was verified (fork test, Chainlink Local test, or user-run).
4. `/status`: honest health: what is configured and what is not.

## 1. The paid loop (60 seconds): local fork or deployed Arc

On the fork: `pnpm fork -- --detach && pnpm fork:app` (needs Circle's Arc Foundry), open http://localhost:9010/localnet,
connect the local wallet and take test USDC from the faucet. On a deployed Arc, sign in with Privy and fund from
https://faucet.circle.com.

1. `/station/0`, drive the arm to the goal, stop, **submit**. The verifier replays the run and signs a score
   (EIP-712). One Arc transaction then records the trajectory and pays `reward × score` in USDC from the task's escrow.
2. The station shows the score, the USDC that arrived and the measured time to a final receipt. Arc finality is
   deterministic: the payout is final when its block lands.
3. `/portfolio`: the operator's USDC, runs and certificates. `/task/0` shows the run, with its Arc Memo tag where the node
   runs Arc's CallFrom precompile.

## 2. An agent buys the corpus (30 seconds)

```bash
node --import ./test/register.mjs scripts/agent-buy.mjs http://localhost:9010 0
```

The agent asks `GET /api/agent/corpus?taskId=0`, is answered `402` (0.01 USDC on `eip155:5042002`), signs an EIP-3009
authorisation, and gets the file in the same request. The sale appears on `/agents` with the file's sha256 and the
buyer's ERC-8004 agent id, read from the `SalesLog` contract rather than our database.

## 3. Do not take our word for it

- `pnpm e2e:core` does steps 1 and 2 with real signed transactions and asserts the balances: the operator's USDC rose by
  exactly the payout, from the escrow, in one transaction; one cent left the agent and reached the treasury. A
  recorded run with every tx hash is in [E2E-FORK.md](E2E-FORK.md).
- `pnpm contracts:test` (156 pass) and `pnpm test:unit` (141 pass, 1 skipped).

## What is deliberately not in the two minutes

CCTP withdrawals, CCIP licences bought from Base, and Circle Gateway funding (off unless
`NEXT_PUBLIC_FEATURE_GATEWAY=1`) need funds on other chains and Circle's attestation service. They are contract-tested
and fork-tested, their live legs are user-run, and none of them is on the core loop's path: if they fail, the loop above
still pays.
