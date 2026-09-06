# Is Avalanche actually used here?

Short answer: **the chain is used properly; Avalanche's own technology is
not.** Six contracts are deployed and Sourcify-verified on Fuji, a real
trajectory settles and pays in one transaction, and a policy licence fans out
to its cap table — all of that works. But every call goes over generic C-Chain
JSON-RPC. Nothing Avalanche built beyond the EVM is touched.

That distinction is the whole audit. A judge on this track is not asking
whether the app works on Avalanche. They are asking whether it needed to be.

**State on Fuji, re-verified 30 Aug 2026:** 8 tasks funded, 7 trajectories
settled, 1 policy minted and licensed, 6 contracts `exact_match` on Sourcify.
Runtime hosts: `thenar.io` and `api.avax-test.network` only.

---

## 1. What Avalanche actually offers — verified on Fuji, 30 Aug 2026

| Capability | Verified how | Result |
| --- | --- | --- |
| **Teleporter / ICM messenger** | `eth_getCode` on `0x253b2784…0aa5fcf` | **13,014 bytes — live on Fuji C-Chain** |
| **Teleporter registry** | `eth_getCode` on `0xF86Cb19A…bFB228` | **2,794 bytes — live** |
| **Glacier / AvaCloud Data API** | `GET /v1/chains`, then our own tx and contract | **200. Indexes our contract, our licence tx, and native balances** |
| **Warp precompile** `0x02…05` | `eth_getCode` on Fuji C-Chain | **2 bytes — absent.** Subnet-EVM only, so it needs our own L1 |
| Multicall3 | `eth_getCode` | 3,809 bytes — live, and we do declare it |
| **P-256 precompile** `0x…0100` | Signed with WebCrypto secp256r1, called it | **Present.** Valid signature returns `0x…01`, tampered returns `0x` — the same on Monad and Fuji |
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

### Correction: the passkey path works here

An earlier version of this audit said Fuji had no P-256 precompile and that
`PasskeyRegistry` was inert on Avalanche. **That was wrong, and the method was
wrong.** `eth_getCode` is meaningless for a precompile — a precompile has no
bytecode, so it always answers empty. The only honest test is to call it.

Called with a real WebCrypto secp256r1 signature, the deployed registry at
`0x82aE3011…6BCE9F` returns **1**, and returns **0** for the same signature
with one byte of `r` changed. `contracts/src/PasskeyRegistry.sol` is genuine,
working, chain-specific engineering on Avalanche — it is simply not
*Avalanche-exclusive*, since RIP-7212 is adopted across several chains.

What remains true: nothing in the interface calls it yet.

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
