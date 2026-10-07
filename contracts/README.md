# Thenar contracts (Arc)

Foundry project. `npm ci` here installs forge-std, OpenZeppelin v5 and the Chainlink packages (CCIP, Chainlink Local);
`foundry.toml` remaps them.

| Contract | Does |
|---|---|
| `ThenarProtocol` | Tasks, USDC escrow (Circle's ERC-20 at `0x3600…0000`, 6 decimals), runs paid in the call that records them, policies and licences. EIP-3009 task funding (`createTaskWithAuthorization`). Ownerless; per-task escrow cap fixed at deployment. |
| `ThenarVerdicts` | The verifier as an ERC-8004 agent: every paid verdict written to Arc's Reputation Registry (`runVerdict`, feedbackHash = run id). |
| `PasskeyRegistry` | P-256 passkeys verified by Arc's precompile at `0x0100`. |
| `TrajectoryCertificate`, `ContributionRecord` | Soulbound record of who recorded a run; running total of work. |
| `CorpusManifest`, `CorpusAudit` | Merkle root per task's corpus; the audit keeper's verdict on what is served. |
| `CorpusShares`, `SalesLog` | The corpus as shares held by passkey-admitted operators, dividends in USDC; every sale with the sha256 served and the buyer's ERC-8004 agent id. |
| `ccip/ThenarCcipSender`, `ccip/ThenarCcipReceiver` | A buyer on Base/Ethereum licenses a corpus on Arc: CCTP V2 moves the USDC, Chainlink CCIP carries the order. |

```bash
npm ci && forge build && forge test                       # unit + Chainlink Local
ARC_FORK_TESTS=1 arc-forge test --network arc --match-path 'test/fork/*'   # Arc testnet fork, Circle's Arc Foundry
../scripts/deploy.sh testnet                              # deploy (see ../MAINNET.md for mainnet)
```
