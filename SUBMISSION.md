# Thenar on Arc — Arc Microgrants submission

**Hosting:** [Live Arc testnet frontend and API](https://thenar-arc.vercel.app). Privy origin approval remains a lead action; testnet dev-wallet access is available. See [hosted checks](docs/HOSTED.md).

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
- Vercel URL pending verification. The former Railway deployment was deleted; local browser checks are documented in `docs/BROWSER-ROUND2.md`.

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

<!-- MAINNET-ADDRESSES -->
## Addresses — live mainnet and testnet

Mainnet **5042: Live**, deployed 2026-10-14. [All mainnet addresses and transaction receipts](docs/MAINNET-DEPLOYMENT.md).
Testnet **5042002: Live**; [testnet deployment](deployments/arc-testnet.json) and [testnet evidence](docs/E2E-TESTNET.md).

- ccipReceiver: [0x9bC7A8F90e8B26ca1135358938A5542cD9334b92](https://explorer.arc.io/address/0x9bC7A8F90e8B26ca1135358938A5542cD9334b92).
- contributionRecord: [0x9e38cA5E04c8135e6676D2C6633f9cB5747bE578](https://explorer.arc.io/address/0x9e38cA5E04c8135e6676D2C6633f9cB5747bE578).
- corpusAudit: [0x69b02DA6F64a2d5962Ef0b4710bAFd85D76e5bC0](https://explorer.arc.io/address/0x69b02DA6F64a2d5962Ef0b4710bAFd85D76e5bC0).
- corpusManifest: [0x9cAF33dEcfab291D63D451e934eae410a09B0012](https://explorer.arc.io/address/0x9cAF33dEcfab291D63D451e934eae410a09B0012).
- corpusShares: [0x4E8f310ffc70C9DcaA64f5CaDb5F20a50cE8482d](https://explorer.arc.io/address/0x4E8f310ffc70C9DcaA64f5CaDb5F20a50cE8482d).
- passkeyRegistry: [0x3a9D0CA0029905dc32f8036BA28DFF33080AC254](https://explorer.arc.io/address/0x3a9D0CA0029905dc32f8036BA28DFF33080AC254).
- protocol: [0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619](https://explorer.arc.io/address/0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619).
- salesLog: [0x8095Ea4D12620B4EC116F951C954702832fA6845](https://explorer.arc.io/address/0x8095Ea4D12620B4EC116F951C954702832fA6845).
- trajectoryCertificate: [0x49082C4AB554003f9b517146a8265E208Ef5067B](https://explorer.arc.io/address/0x49082C4AB554003f9b517146a8265E208Ef5067B).
- verdicts: [0xe3A583c613B075E61e18da4bFB82b94888721a8e](https://explorer.arc.io/address/0xe3A583c613B075E61e18da4bFB82b94888721a8e).

Mainnet smoke: [Smoke: verified recorded trajectory, seed reward <=0.05 USDC](https://explorer.arc.io/tx/0xe3c2d8c5c715b034083e2ee7916ed7cf5ed4d2cae02a51498956c5232a2d4594).
<!-- /MAINNET-ADDRESSES -->
