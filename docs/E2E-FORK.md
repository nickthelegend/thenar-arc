# Core loop on the Arc fork: proof

`pnpm e2e:core` ([scripts/e2e-core.mjs](../scripts/e2e-core.mjs)) runs the core loop with real signed transactions on a
local fork of Arc testnet (chain 5042002, Circle's Arc Foundry anvil 1.7.1-dev, Circle's real USDC at `0x3600…0000`)
against the app's real routes. Nothing is mocked. The raw output is [e2e-core.log](e2e-core.log).

**Provenance.** The run below was made on 2026-10-13 (15:18Z) from the script committed here, on a fresh fork of Arc
testnet (fork block 67008429, anvil on :9000, production build of the app on :9010) with a fresh deployment of this
repo's contracts (ThenarProtocol `0xBEE947C7efb01172b53644F22e98ADf93E47BcC3`). The fork's addresses and role keys are
throwaway: they are not testnet or mainnet deployments, and nothing was broadcast to a public chain. Re-run it with:

```bash
AF="/Volumes/Extreme SSD/Projects/arc/.tools/arcfoundry"
ARC_ANVIL="$AF/anvil" ARC_FORGE="$AF/forge" node scripts/arc-fork.mjs --detach --fresh   # fork on :9000
pnpm fork:app &                                                                          # app on :9010
pnpm e2e:core
```

## Steps and transactions

| # | Step | Transaction |
|---|---|---|
| 1 | Fork faucet sends the fresh operator (`0x8fF7…3eCC`) 20 USDC | `0xeccf04254b259814b3960e83bcee5be103b7fe0bc3869598d4d2c6680c177f16` |
| 2 | Issuer admits the operator to CorpusShares (a script has no passkey) | `0x43678aa878c40cbd91382fab7d25df41137c6a590aa7559c63c4ecf32a742aab` (block 67008580) |
| 3 | Operator records a run; verifier replays it and signs the score (`/api/verify`, score 90.28) | off chain (EIP-712 signature) |
| 4 | **One transaction records the run and pays the operator from escrow**: `ThenarProtocol.submitTrajectoryFor` | `0x05073b5d4f51ccc8ca95134c767ddcc249015d51a6c254108979c518d50f93b1` (block 67008583, success) |
| 5 | CorpusShares issue for the run (90 shares) | `0x1f7aaf685cb6ed600fc9ae75ebede63e505deafc0eac542b2198e7a1738408b1` |
| 6 | **Agent buys the corpus over x402**: `402` offering 0.01 USDC on `eip155:5042002`, EIP-3009 `transferWithAuthorization` settled by the in-process facilitator | `0xcedd4f67a3057da55f1728f52b47fe697579bc9371dd463ecd12400b55ede173` (block 67008585, success) |
| 7 | `SalesLog.logSale` (#1) records the sha256 of the bytes the agent received; buyer is ERC-8004 agent #897268 | `0xbb5a4426a9ada0c6b1cdbbb56ddc8edc6a52befa09bee164ff08dc99d560e3ab` |

A second, separate purchase with the standalone buyer (`scripts/agent-buy.mjs http://localhost:9010 0`, the command in
the judge walkthrough): x402 settlement `0x8b9a0e5f882ac4a4e12629bdbada38437506d5f1315d6072b78bc3a0e55a8a18`, SalesLog
entry #2 with the same sha256 as the file received, and a `corpusQuality` rating of the verifier agent (#897267) in
ERC-8004's Reputation Registry (`0xbc927dd23348915fd2e571fe2927ff9e555923b5e7aa8cf2b0922ae7f8e61ced`).

## What the script asserts (all passed)

- The operator's USDC `balanceOf` rose by exactly the payout (0.04514 USDC, 20 → 20.04514) in the same transaction.
- The payout came out of the task's escrow (0.3 → 0.25486 USDC); `TrajectoryAccepted` names the operator.
- The unpaid request is a `402`; the paid request returns the corpus, which contains the run just paid for.
- Exactly 0.01 USDC left the agent (9999.996267 → 9999.986267) and reached the corpus treasury.
- `SalesLog.saleCount` rose 0 → 1 and the logged sha256 equals the sha256 of the response body.

Also on the same fork and build: `pnpm test:e2e:fork` (90 checks, 0 failed) exercised the routes, the front door
(`/` is the product, `/labs` the company page) and the OpenAPI document against the live app.
