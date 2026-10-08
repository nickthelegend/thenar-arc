# Slither (0.11.6), medium and above

`cd contracts && slither . --filter-paths "node_modules|test|script" --exclude-informational --exclude-low --exclude-optimization`

Fixed: `_license` now computes every cut and records the sale (`licencesSold`, `distributed`, `licensed`) before any
USDC moves; locals Slither read as uninitialized are initialized explicitly.

Remaining, each reviewed and kept:

| Finding | Why it stays |
|---|---|
| `reentrancy-no-eth` in `ThenarProtocol._license` | The only state written after a transfer is `claimable` / `claimableTotal`, inside `_send`, when Circle's USDC refuses a transfer (a blocklisted contributor). The call is to the USDC token (no callbacks), and every external entry point is `nonReentrant`. |
| `reentrancy-no-eth` in `ThenarCcipReceiver.resolveFailedMessage` | Owner-only; the "external call" is `this.processMessage` (a self-call used to catch a revert), and the status is written after it on purpose: the owner can only resolve a message that still fails. |
| `uninitialized-state` `CorpusManifest._history` | False positive: a mapping of arrays, appended by `commit`. |
| `incorrect-equality` (5) | Comparisons with zero / sentinel values (`n == 0`, `v == 0`), not balances an attacker can steer. |

No contract has an owner power that can move or freeze escrowed or owed USDC. `ThenarProtocol` is ownerless;
`ThenarVerdicts`' deployer can only set the protocol address once; `ThenarCcipReceiver`'s owner can allowlist senders,
resolve messages that cannot be processed, and sweep only `balance - (pendingTotal + owedTotal)`.
