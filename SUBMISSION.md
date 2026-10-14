# Thenar on Arc — Arc Microgrants submission

**Live: https://thenar-production.up.railway.app** (Arc testnet build, hosted on Railway; seeded with the two testnet-paid runs, e.g. [/run/0x4a1e…4462](https://thenar-production.up.railway.app/run/0x4a1efdd8f4c06c0bbd565657a2c776b65fc1f2d95b5d1768faa3ffa0776f4462) shows "Integrity verified"; sign-in needs the origin allow-listed in Privy). Screenshots: [docs/screens/hosted](docs/screens/hosted).

**Supersedes** the earlier Thenar build made for ETHOnline 2026 (native-value escrow, several chains). This one is Arc
only and USDC throughout.

## Description (≤150 words)

Thenar pays people to teach robots, and sells what they record to AI agents, on Arc. An operator drives a robot arm in
the browser; a verifier scores the run and signs; one Arc transaction records the trajectory and pays the operator in
USDC from the task's escrow. Arc makes that per-run payout honest: USDC is the escrow, the payout and the gas, so an
operator holds one token, and deterministic sub-second finality means the payout is final when its block lands. AI
agents buy a task's corpus over x402, paying a cent of USDC in the HTTP request that fetches it; every sale is logged
on chain with the hash served. That loop ran with real transactions on Arc testnet. ERC-8004 verdicts, Arc Memo tags,
CCTP withdrawals and CCIP licences are built and tested on a fork; they have not run on the public network.

## Status, by label

- **Live (testnet)**: USDC as escrow, payout and gas; sub-second finality; x402 purchase in USDC with the sale logged on
  chain. Ten contracts deployed, a run paid, a sale logged: [docs/E2E-TESTNET.md](docs/E2E-TESTNET.md).
- **Fork** (local fork of Arc testnet, or Chainlink Local): ERC-8004 verdicts, Arc Memo, CCTP burn, CCIP licence,
  P-256 passkeys, EIP-3009 gasless posting, audit keeper.
- **Not run**: Circle Gateway funding (off by default); CCTP attestation and mint; any live CCIP send.
- The verifier is **not** registered as an ERC-8004 agent on testnet yet.
- No hosted demo: judges run it locally or read the recorded evidence.

## What it uses Arc for

- **USDC as money and gas** *(Live, testnet)*: escrow, payouts, licences and dividends in Circle's USDC (`0x3600…`); operators and agents hold nothing else.
- **Sub-second deterministic finality** *(Live, testnet)*: one transaction records a run and pays it, final on inclusion; the station shows the measured time (the testnet payout cost 509k gas, 0.0127 USDC).
- **x402 in USDC** *(Live, testnet)*: agents pay per corpus with EIP-3009 (`"USDC"/"2"`), settled by Thenar's in-process facilitator.
- **ERC-8004** *(Fork)*: the verifier can be registered and every paid verdict written to Arc's Reputation Registry; buyers can send an agent id. Not registered on testnet.
- **Arc Memo** *(Fork)*: a payout can be tagged with its run id.
- **CCTP V2** *(Fork, burn only)*: operators can withdraw earnings to Base, Ethereum or Arbitrum; the attestation and mint were never run.
- **Chainlink CCIP + CCTP** *(Fork, Chainlink Local)*: a buyer agent on Base/Ethereum can license a corpus on Arc; no live send.
- **P-256 precompile** *(Fork)*: passkey sign-in verified on chain; no passkey was registered on testnet.

## Demo steps (about two minutes; see docs/JUDGE-WALKTHROUGH.md)

1. Evidence first, no wallet: `pnpm seed:proof` then `pnpm build && pnpm start`; open the printed `/run/<hash>` (replay, "Integrity verified", payout transaction) and click through the explorer links in docs/E2E-TESTNET.md.
2. `/hub` → `/station/0`: drive the simulated arm (W/A/S/D/E/Q, Space for the jaws) and see the practice score. Paying for a run needs sign-in, which needs a Privy app id (see README).
3. `/agents` lists the x402 sales read from the on-chain SalesLog (the testnet purchase is step 6 in docs/E2E-TESTNET.md). To buy one yourself, `node --import ./test/register.mjs scripts/agent-buy.mjs <app> 0` needs a funded `AGENT_PRIVATE_KEY` (testnet USDC from faucet.circle.com).
4. `/arc`: every piece of the Arc stack with a live reading, its status label and how it was verified.
