# Cleanverse CVI/CVA: what is on chain, and why Thenar can't move CVA yet

Checked 6 Oct 2026. The bounty (Track 4, $2k) asks for an app that **gates CVA asset movement behind on-chain CVI
identity verification**.

## The docs are still gated

`docs.cleanverse.com` redirects to `/_gate/page` (an invite code). Public repos from other Metropolis teams don't fill
the gap: their Cleanverse interfaces are invented or mocked (`ICVI.hasIdentity`, signed attestations, `/apass/verify`
endpoints). None of those functions exist in the deployed contracts.

## What is actually deployed on Monad testnet

None of the contracts is source-verified (Sourcify has no match). The interfaces below come from their bytecode,
with selectors resolved by `cast selectors --resolve`, and from read-only calls.

| Contract | Address | What it exposes |
|---|---|---|
| Validator (UUPS proxy) | `0xaC7e5179C2C7f03f209136886c172eb34F161792` → impl `0x68Ce853D…D5a9` | `complianceVerify(address pool, address user)` (view), `isRegistered(pool)`, `getRules(pool)`, `isFrozen(pool,user)`, `isPaused(pool)`, `apass()`, `tokenPolicy()`; roles `REGISTER_ROLE`, `REGISTER_ADMIN_ROLE`, `POLICY_ADMIN_ROLE` |
| A-Pass (CVI), UUPS proxy | `0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9` | Soulbound ERC-721 "A-Pass" whose transfers revert. The token id is the holder's address (`getTokenId`). `balanceOf`, `freeze`/`unfreeze`/`revoke`, `ISSUER_ROLE`, and issue functions taking `(address, uint8, uint8, bytes2, bytes2, uint64, uint256, uint256[, uint256])` (tier, sub-tier, two region codes, expiry …) |
| aUSDC (CVA) | `0xFA96de5b8f434c26fdff953303dd66ff80af1026` | "Cleanverse USD", **18 decimals**, 7 holders. Plain ERC-20 plus owner `mint`/`burn` and a `policy()`. No EIP-3009, so it can't be an x402 asset. |
| aUSDC policy | `0x2c6E4819cF4bb4A355F5b29903cFf44053e5eBFf` | `canTransfer(token, from, to, amount)` (bool), `getCredential(holder)`, `strictMode()` (false), rule setters |
| Token policy (UUPS) | `0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd` | `canTransfer(…)`, `registerToken`, `isTokenRegistered`, `getRule` |

What the calls answer today:

- `complianceVerify(pool, user)` reverts `PoolNotRegistered()` (`0x739f4185`) for any pool Cleanverse hasn't
  registered. Registering needs `REGISTER_ROLE`, which only Cleanverse holds.
- On a local anvil fork of Monad testnet, every aUSDC move reverts `TransferNotAllowed()` (`0x8cd22d19`), including
  a `mint` by the token's owner (`0x0368…d0a8`, who holds an A-Pass). The policy answers `canTransfer = false` even
  owner → owner. Its rules, not the token, decide, and nothing outside Cleanverse can set them.

So no app outside Cleanverse can move CVA on Monad testnet today. A gate built now could only be tested on its
refusals, never on the transfer the bounty is about.

## What Thenar would build once Cleanverse onboards it

Thenar is where people are paid per run. The natural gate is **a task bounty paid in aUSDC, released only to
operators the validator clears**:

1. A lab escrows aUSDC for a task. The escrow contract is the `pool` registered with the validator.
2. An operator's accepted run (already on chain in `AxonProtocolV2`) makes its reward claimable.
3. `claim` calls `validator.complianceVerify(escrow, operator)` before moving any aUSDC. aUSDC's own policy checks
   the transfer a second time.

On top of that, Thenar's passkey proves a person recorded the run, and the A-Pass proves who they are.

## What to ask Cleanverse for

Telegram `t.me/TheCleanverseGroup` or `support@cleanverse.com`:

1. Docs access (the invite code for `docs.cleanverse.com`).
2. Registration of Thenar's escrow contract as a validator pool on Monad testnet, with rules for aUSDC.
3. Test A-Passes for two or three wallets (a lab and operators), and the rule set that lets aUSDC move between them.
4. A test aUSDC allocation for the lab wallet.
