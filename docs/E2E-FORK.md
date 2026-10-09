# Core loop on the Arc fork: proof

`pnpm e2e:core` ([scripts/e2e-core.mjs](../scripts/e2e-core.mjs)) runs the core loop with real signed transactions on a
local fork of Arc testnet (chain 5042002, Circle's Arc Foundry anvil, Circle's real USDC at `0x3600…0000`) against the
app's real routes. Nothing is mocked. The raw output is [e2e-core.log](e2e-core.log).

**Provenance, stated plainly.** The run below was made on 2026-10-08T04:11Z (fork block 66048571, app on :9020) from
the same script that is committed here. It was not re-run on 2026-10-09 because the Arc Foundry binary was no longer on
the machine (`arc-anvil`/`arc-forge` are not installed; stock Foundry cannot execute Arc's native-USDC precompile).
Re-run it with `ARC_ANVIL=/path/to/arc-foundry/anvil pnpm fork -- --detach && pnpm fork:app && pnpm e2e:core`.
The fork's addresses are throwaway: they are not testnet or mainnet deployments.

## Steps and transactions

| # | Step | Transaction |
|---|---|---|
| 1 | Fork faucet sends the fresh operator (`0x7E7B…0DF9`) 20 USDC | `0xb1949d686857e7887c74230be30ba171e7e8d1cf19c66ae2c4725a14bd745715` |
| 2 | Issuer admits the operator to CorpusShares (a script has no passkey) | `0xa6391eaa7665c2c19e3b958675e45a92d1e01b622c349440795bd92ddcb76a52` (block 66048574) |
| 3 | Operator records a run; verifier replays and signs it (`/api/verify`, score 91.65) | off chain |
| 4 | **One transaction records the run and pays the operator from escrow**: `ThenarProtocol.submitTrajectoryFor` | `0xcb07767c33dbe68595a4ffa83de7fbce683faa97486b8ae1662372002963731d` (block 66048576, success) |
| 5 | CorpusShares issue for the run (92 shares) | `0x05965341f9b605cd4491be480978ca241ec94223eaab08214b77019b42974c8d` |
| 6 | **Agent buys the corpus over x402**: `402` offering 0.01 USDC on `eip155:5042002`, EIP-3009 `transferWithAuthorization` settled by the in-process facilitator | `0xc794dde3a7bcab35e5a0ccac391cd28777a71ebab38ae5c6dbaa55f5b28e0bfa` (block 66048579, success) |
| 7 | `SalesLog.logSale` (#4) records the sha256 of the bytes the agent received; buyer is ERC-8004 agent #897154 | `0x32fb1b00c6858ff37f2ed4e133d9d1875174fc7f9692e60078a914c16ce656d1` |

## What the script asserts (all passed)

- The operator's USDC `balanceOf` rose by exactly the payout (0.01833 USDC, 20 → 20.01833) in the same transaction.
- The payout came out of the task's escrow (0.082708 → 0.064378 USDC); `TrajectoryAccepted` names the operator.
- The unpaid request is a `402`; the paid request returns the corpus, which contains the run just paid for.
- Exactly 0.01 USDC left the agent (9999.880014 → 9999.870014) and reached the corpus treasury.
- `SalesLog.saleCount` rose 3 → 4 and the logged sha256 equals the sha256 of the response body.

Protocol address on that fork: `0x80d0ff7CC08d4D756Ad21D2a0566bee191864641`. Contract tests and the app tests were
re-run on 2026-10-09; see the README for counts.
