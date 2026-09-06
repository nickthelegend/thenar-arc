# Is Avalanche actually used here?

Short answer: **no — not in any way an Avalanche judge would count.** The app
settles on Fuji C-Chain over generic JSON-RPC and touches nothing Avalanche
built. Everything below was verified against the live chain and the running
app, not read off a docs page.

---

## 1. What Avalanche actually offers — verified on Fuji, 30 Aug 2026

| Capability | Verified how | Result |
| --- | --- | --- |
| **Teleporter / ICM messenger** | `eth_getCode` on `0x253b2784…0aa5fcf` | **13,014 bytes — live on Fuji C-Chain** |
| **Teleporter registry** | `eth_getCode` on `0xF86Cb19A…bFB228` | **2,794 bytes — live** |
| **Glacier / AvaCloud Data API** | `GET /v1/chains`, then our own tx and contract | **200. Indexes our contract, our licence tx, and native balances** |
| **Warp precompile** `0x02…05` | `eth_getCode` on Fuji C-Chain | **2 bytes — absent.** Subnet-EVM only, so it needs our own L1 |
| Multicall3 | `eth_getCode` | 3,809 bytes — live, and we do declare it |
| **P-256 precompile** `0x…0100` | `eth_getCode` | **1 byte — absent.** Monad has it; Avalanche does not |
| P-Chain / info endpoints | `GET` → 405 | Present, POST-only as expected |

Not reachable without our own chain, but real and documented: Subnet-EVM
stateful precompiles (native minter, **fee manager**, tx allowlist, deployer
allowlist, reward manager), ICTT interchain token transfer, ACP-77 validator
manager, eERC encrypted balances, BLS signature aggregation.

---

## 2. Audit of this codebase — strict

| Classification | Finding |
| --- | --- |
| **GENUINELY USED** | **Nothing Avalanche-specific.** The only real network calls at runtime go to `api.avax-test.network/ext/bc/C/rpc` — the generic C-Chain JSON-RPC. Measured in the browser on `/hub`: 4 calls to that host, 53 to our own origin, **zero** to Glacier, Teleporter, or any subnet API. |
| **IMPORTED BUT UNUSED** | Nothing — there is no Avalanche SDK to import. `package.json` has **zero** Avalanche-specific packages out of 25 deps. The chain stack is `viem`, `wagmi`, `@rainbow-me/rainbowkit`, all chain-agnostic. |
| **FAKED** | Nothing is faked. No mocks, stubs or hardcoded chain responses anywhere (`grep` for TODO/mock/stub/fake/dummy across `app`, `components`, `lib`, `contracts/src`: **0 hits**). What exists is real; it is just not Avalanche-specific. |
| **MISSING** | ICM/Teleporter, Warp, Glacier/AvaCloud Data API, L1/subnet, every Subnet-EVM precompile, ICTT, eERC, P-Chain, X-Chain, validator management, BLS aggregation, Core wallet. |

**All 33 source references to "Avalanche/AVAX" are prose** — page copy, meta
descriptions, currency labels, a network-switch button. `lib/chain.ts` is a
`defineChain` with an id, an RPC URL and an explorer URL. Swap those four
values and this project runs unchanged on any EVM chain. It did, in fact,
yesterday — it was on Monad.

### The one piece of chain-specific engineering points the other way

`contracts/src/PasskeyRegistry.sol` calls the **P-256 precompile at `0x0100`**
and `AxonProtocol.submitTrajectoryWithPasskey` composes with it. That is
genuine, load-bearing, chain-specific work — for **Monad**, whose EIP-7951
precompile makes secp256r1 verification a `staticcall` instead of hundreds of
thousands of gas of Solidity. Fuji has no such precompile, so on Avalanche the
contract is deployed (`0x82aE3011…6BCE9F`) and **inert**: `verifyWithKey`
returns false for every input because a `staticcall` to an empty address
returns empty data. It fails closed, and nothing in the UI calls it.

So the honest position for an Avalanche track today: **a well-built EVM app
that happens to be pointed at Fuji.** A judge who checks will see exactly that,
and the project's own `MONAD.md` already made this argument about Monad and
concluded "could run on any fast EVM chain" — which is now true of Avalanche.

---

## 3. Where deeper integration genuinely fits

Two surfaces where Avalanche's tech is the *right* answer, not a bolt-on:

**Gas, for the operator.** `PRODUCT.md` states the constraint outright:
*"Submitting requires a wallet and a transaction. Many operators will not have
one, so first-run cost has to be near zero."* That is precisely what Subnet-EVM's
**fee manager precompile** and a **custom gas token** on an Avalanche L1 solve,
and it cannot be solved on C-Chain. This is the strongest organic fit in the
whole project.

**Where the money lives versus where the work happens.** Operators run on a
high-throughput chain; buyers hold assets on C-Chain. **ICM/Teleporter** is
built for exactly that split, and it is live on Fuji today.

**Where it would be forced, and I am not proposing it:** X-Chain asset
transfers, elastic-subnet staking economics, and anything NFT-shaped for
trajectories. A trajectory is a row in a Merkle log, not a collectible; minting
one as an NFT would be a checkbox and a judge would read it as one.
