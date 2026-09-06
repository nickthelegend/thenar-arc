# Axon — demo recording plan

**Chain:** Monad Testnet (10143). This is a blockchain app, so the submission
beat is a real signature broadcast from a testnet key and held on screen until
the transaction confirms.

**Target runtime:** under 3:00.

**Contract:** `AxonProtocol` `0x89384f46e430F37DB61Afb98810eba995C0d6Ed4`

| # | id | What is on screen | Signing |
| --- | --- | --- | --- |
| 1 | `intro` | Landing hero, the AXON-6 arm running its cycle | |
| 2 | `landing-figures` | The live counters, all read from the contract | |
| 3 | `hub` | Open tasks, their escrow and per-run reward | |
| 4 | `station-open` | The station for one task: goal, reward, slots | |
| 5 | `station-begin` | Begin run — timer starts, arm is live | |
| 6 | `station-grasp` | Lower onto the payload, IN RANGE, jaws close | |
| 7 | `station-place` | Carry it to the datum and let go | |
| 8 | `station-score` | The verdict: score, deviation, breakdown | |
| 9 | `connect` | Wallet connects to Monad Testnet | |
| 10 | `sign` | **Submitting: real transaction signed and broadcast** | **YES** |
| 11 | `confirmed` | Payout, transaction hash, block time | |
| 12 | `explorer` | The same hash on testnet.monadscan.com — the MON transfer | |
| 13 | `foundry` | A minted policy's cap table; one licence pays every contributor | |
| 14 | `outro` | Close | |

## Preflight
- The task driven must have a free slot and escrow, chosen at run time from the
  contract rather than hardcoded.
- The demo key is the testnet deployer in `.env.deployer`. Never mainnet.
- Wallet state is cleared before driving; the shim connects as `injected`.
- The grasp is verified from the app's own readout (`PAYLOAD HELD`), not assumed.
