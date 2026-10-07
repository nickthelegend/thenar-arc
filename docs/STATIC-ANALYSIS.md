# Static analysis and secret scan

Run on 6 Oct 2026 against `main`.

## Slither

```bash
cd contracts
slither . --filter-paths "lib/|test/|script/" --exclude-informational --exclude-low
```

Slither 0.10 over 17 contracts in `src/`. Every High and Medium finding was read against the code.

| Finding | Where | Verdict |
|---|---|---|
| High `arbitrary-send-eth` | `SponsoredAccount.execute` | **By design.** The call runs only with the account's own signature over (chain, account, nonce, target, value, data). It is the whole purpose of the contract, which exists only on the local chain. |
| High `reentrancy-eth` (×2) | `AxonProtocolV2.claim`, `AxonProtocol.claim` | **False positive.** `claimable` is zeroed before the call. The write after the call restores it only on a failed send, and that branch then reverts, so a re-entry reads 0. |
| High `reentrancy-eth` (×4) | `licensePolicy` (v1, v2) | **No loss of funds.** Payouts go out with a 30,000-gas stipend before two counters (`licencesSold`, `distributed`) are updated. A re-entry would have to pay the full licence fee itself and would be counted separately. The counters are bookkeeping and gate no transfer. Reordering would change bytecode that is already deployed and verified on Monad (v1 at Blitz, v2 now), so it is recorded rather than changed. |
| High `reentrancy-eth` | `Referrals.claim` | **False positive.** Every effect is written before the 30,000-gas call. The writes after it only undo a claim whose payment failed. A re-entry is a different claimant's own claim, held to the same checks. |
| High `uninitialized-state` | `CorpusManifest._history` | **False positive.** A mapping needs no initialiser; `commit` pushes to it. |
| Medium `incorrect-equality` (×7) | zero checks (`amount == 0`, `pot == 0`, …) | **Intended.** These are exact-zero guards on integers, not comparisons of balances against expectations. |
| Medium `uninitialized-local` (×4) | `handed`, `total` | **Intended.** Accumulators that start at zero. |
| Medium `locked-ether` | `RefusingContributor` | **Intended.** A test contract that refuses payment, used to prove `PaymentDeferred` works. It is never given value outside tests. |

No finding needs a code change.

## Contract tests

```bash
cd contracts && forge test   # 133 passed, 0 failed (17 suites)
```

## Secrets

Everything tracked in git was scanned with `git grep`:
- key=value assignments of `PRIVATE_KEY`, `SECRET`, `API_KEY`, `_TOKEN` or `PASSWORD` with a real-looking value;
- provider token shapes: `sk-`, `AKIA`, `ghp_`, `xox[bp]-`, `AIza`, PEM private keys;
- raw 64-hex values next to "key", "priv" or "secret";
- tracked `.env`, `.key`, `.pem`, `.p12` or keystore files.

Result:
- No secrets.
- The only 64-hex values beside such words are two constants in `SponsoredAccount` (a storage-slot hash, and secp256k1n/2) and anvil's published test accounts #7 and #8 in `test/live-cre-audit.mjs`.
- The tracked env files are the three `.env.example` files, which hold no values, and `cre/secrets.yaml`, which is empty by design.

Real keys live only in untracked `.env.local`, `.env.deployer` and `.env.localnet` (anvil's published keys), and in hosting
env vars set by the user.
