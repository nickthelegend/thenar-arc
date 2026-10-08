# Thenar on Arc — Arc Microgrants submission

**Supersedes** the earlier Thenar-on-Arc testnet build made for ETHOnline 2026 (native-value escrow, x402 on Hedera,
World AgentKit). That build mixed three chains and its Hedera half broke; this one is Arc only.

## Description (≤150 words)

Thenar pays people to teach robots, and sells what they record to AI agents, on Arc. An operator drives a robot arm in
the browser; a verifier scores the run and signs; one Arc transaction records the trajectory and pays the operator in
USDC from the task's escrow. Arc makes that per-run payout honest: USDC is the escrow, the payout and the gas, so an
operator holds one token, and deterministic sub-second finality means the payout is final when its block lands. AI
agents buy a task's corpus over x402, paying a cent of USDC in the HTTP request that fetches it; every sale is logged
on chain with the hash served. The verifier is an ERC-8004 agent whose paid verdicts are written to Arc's Reputation
Registry, payouts carry the run id through Arc Memo, operators withdraw anywhere with CCTP, and buyers on Base license
corpora over CCIP.

## What it uses Arc for

- **USDC as money and gas**: escrow, payouts, licences and dividends in Circle's USDC (`0x3600…`); operators and agents hold nothing else.
- **Sub-second deterministic finality**: one transaction records a run and pays it, final on inclusion; the station shows the measured time.
- **x402 in USDC**: agents pay per corpus with EIP-3009 (`"USDC"/"2"`), settled by Thenar's in-process facilitator.
- **ERC-8004**: the verifier and buying agents are registered agents; every paid verdict is feedback on Arc's Reputation Registry.
- **Arc Memo**: each payout is tagged with its run id.
- **CCTP V2**: operators withdraw earnings to Base, Ethereum or Arbitrum.
- **Chainlink CCIP + CCTP**: a buyer agent on Base/Ethereum licenses a corpus on Arc in one transaction.
- **P-256 precompile**: passkey sign-in verified on chain.

## Demo steps (about two minutes; see docs/JUDGE-WALKTHROUGH.md)

1. Open the app, sign in, get test USDC (Circle faucet on testnet; `/localnet` on the fork).
2. `/hub` → pick a task → `/station/0`: drive the simulated arm (W/A/S/D/E/Q, Space for the jaws), stop, submit.
3. The station shows the score, the USDC payout and the time to a final receipt; the run page shows the Memo tag.
4. `/agents`: an agent buys the corpus over x402 (`node --import ./test/register.mjs scripts/agent-buy.mjs <app> 0`); the sale and its sha256 appear with the agent's ERC-8004 id, next to the verifier's record.
5. `/arc`: every piece of the Arc stack with a live reading and how it was verified.
