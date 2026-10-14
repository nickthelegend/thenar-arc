# Judge walkthrough (about two minutes)

**Hosting:** the former Railway deployment was deleted. Vercel deployment and Privy origin approval are pending verification. Run locally with the commands below; do not use the old Railway URL.


Round 2: follow [BROWSER-ROUND2.md](BROWSER-ROUND2.md) for the complete sponsor → operator → payout → x402 browser flow. It is **Not run** until the lead executes those checks outside the sandbox.

Thenar pays people to teach robots, per run, in USDC on Arc, and sells what they record to AI agents over x402.
The evidence in section 0 needs no wallet. The paid browser flow runs on a local Arc fork.

## Status at a glance

| Label | Pieces |
|---|---|
| **Live (testnet)**: real transactions on the public Arc testnet | USDC escrow + payout + gas, sub-second finality, x402 purchase, SalesLog |
| **Fork**: run on a local fork of Arc testnet or in Chainlink Local | ERC-8004 verdicts, Arc Memo, CCTP burn, CCIP licence, P-256 passkeys, gasless posting, audit keeper |
| **Not run** | Circle Gateway funding (off by default), CCTP attestation and mint, any live CCIP send |

The verifier is not registered as an ERC-8004 agent on testnet. Sign-in (Privy) needs an app id this repo does not ship,
so on a fresh checkout paid runs cannot be driven from a browser; the evidence below does not need it.

## 0. See it working with no wallet and no keys (2 minutes)

The recorded Arc testnet run is in [E2E-TESTNET.md](E2E-TESTNET.md) with explorer links for every transaction
(`https://explorer.testnet.arc.io/tx/<hash>`). To see it in the app:

```bash
pnpm install
pnpm seed:proof          # stores the 2 runs paid on testnet, after re-checking each tx on chain
pnpm build && pnpm start # http://localhost:3000 (Arc testnet is the default network)
```

1. `/run/0x842bcb0fe0cf501035104614264a793836dc4d376c44f207642169bec538e99b`: the replay, score 92.14, "Integrity verified"
   (the hash is recomputed from the stored samples on every read), and the payment transaction. The paying transaction
   `/run/0xa5214ce03c81b1fd91a799ae90beeb0de756e641691b9ae3999e5cc5fe0c95ed` redirects to the same run.
2. `/hub` and `/station/0`: task #0 and its escrow, read from the contract on Arc testnet. Drive the simulated SO-101
   arm (W/A/S/D move, E/Q lift, Space the jaws); practice runs are scored without a wallet, so you see the replay and score.
3. `/agents`: the x402 sales read from the on-chain SalesLog, with the sha256 served.
4. `/arc` (status labels) and `/network` (live block, finality, USDC-is-gas, P-256 precompile reading).

## 1. The paid loop from a browser (60 seconds): local fork only

On the fork (needs Circle's Arc Foundry; quote its path if it contains a space):

```bash
export ARC_ANVIL="/path/to/arcfoundry/anvil" ARC_FORGE="/path/to/arcfoundry/forge"
pnpm fork -- --detach && pnpm fork:app     # fork on :9000, app on :9010
```

Open http://localhost:9010/localnet, connect the local wallet and take test USDC from the faucet. (On Arc testnet this
needs Privy sign-in, which needs your own `NEXT_PUBLIC_PRIVY_APP_ID`; it has not been exercised from a browser there.)

1. `/station/0`, drive the arm to the goal, stop, **submit**. The verifier replays the run and signs a score
   (EIP-712). One Arc transaction then records the trajectory and pays `reward × score` in USDC from the task's escrow.
2. The station shows the score, the USDC that arrived and the measured time to a final receipt. Arc finality is
   deterministic: the payout is final when its block lands.
3. Optional (off by default): switch on **Race the best run** in the station's left panel to replay the task's best paid run as a
   translucent arm beside yours (off by default; drawn only, never scored).
4. `/portfolio`: the operator's USDC, runs and certificates. `/task/0` shows the run, with its Arc Memo tag where the node
   runs Arc's CallFrom precompile.

## 2. An agent buys the corpus (30 seconds, fork; the testnet purchase is E2E-TESTNET step 6)

```bash
NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/agent-buy.mjs http://localhost:9010 0
```

The agent asks `GET /api/agent/corpus?taskId=0`, is answered `402` (0.01 USDC on `eip155:5042002`), signs an EIP-3009
authorisation, and gets the file in the same request. The sale appears on `/agents` with the file's sha256 and the
buyer's ERC-8004 agent id, read from the `SalesLog` contract rather than our database.

## 3. Do not take our word for it

- `pnpm e2e:testnet` (needs funded keys in `.env.local`) and `pnpm e2e:core` (fork) do steps 1 and 2 with real signed transactions and assert the balances: the operator's USDC rose by
  exactly the payout, from the escrow, in one transaction; one cent left the agent and reached the treasury. A
  recorded run with every tx hash is in [E2E-TESTNET.md](E2E-TESTNET.md) (public testnet) and [E2E-FORK.md](E2E-FORK.md).
- `pnpm contracts:test` (156 pass, 2 fork suites skipped without Arc Foundry), `pnpm test:unit` (147 pass, 1 skipped) and
  `pnpm test:e2e:fork` (93 checks against the running app).

## What is deliberately not in the two minutes

CCTP withdrawals, CCIP licences bought from Base, and Circle Gateway funding (off unless
`NEXT_PUBLIC_FEATURE_GATEWAY=1`) need funds on other chains and Circle's attestation service. CCTP's burn and the CCIP
licence ran on a fork or in Chainlink Local; the attestation, the destination mint, any live CCIP send and every Gateway
step have **never been run**. None of them is on the core loop's path: if they fail, the loop above still pays.
