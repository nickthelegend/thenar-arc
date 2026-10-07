/**
 * Gas sponsorship on the local chain, standing in for Privy's on Monad.
 *
 * On Monad, an operator who signed in with email can have every transaction
 * paid for by Privy (lib/contract-write.ts). The embedded wallet delegates its
 * address to a smart account under EIP-7702, and Privy sends the transaction.
 * Privy is a hosted service with no local chain, so a local build reproduces
 * the same on-chain shape itself:
 * - the local wallet delegates to SponsoredAccount
 *   (contracts/src/localnet/SponsoredAccount.sol);
 * - it signs each call;
 * - /api/localnet/sponsor sends it from a sponsor's key, which pays the gas.
 * The protocol sees the operator's own address, exactly as it would on Monad.
 *
 * Shared by the wallet that signs and the route that sends, so both hash the
 * same digest.
 */
import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from "viem";

/** The account sponsored wallets delegate to; scripts/localnet.mjs deploys it and writes this. */
export const SPONSORED_ACCOUNT = (process.env.NEXT_PUBLIC_LOCAL_SPONSORED_ACCOUNT ?? "") as Address | "";

export const SPONSORED_ACCOUNT_ABI = parseAbi([
  "function nonce() view returns (uint256)",
  "function execute(address target, uint256 value, bytes data, bytes signature) payable returns (bytes)",
  "error BadSignature()",
  "error CallFailed(bytes reason)",
]);

/** What the account's key signs, as a personal message, for its call number `nonce`. */
export function sponsoredDigest(chainId: number, account: Address, nonce: bigint, target: Address, value: bigint, data: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [BigInt(chainId), account, nonce, target, value, keccak256(data)],
    ),
  );
}

/** The code an address carries once it has delegated to `implementation` (EIP-7702). */
export const delegationCode = (implementation: Address) => `0xef0100${implementation.slice(2)}`.toLowerCase();

const STORE = "thenar:localnet:sponsor";
/** Whether this browser's local wallet asks the sponsor to pay. A local-build setting only. */
export function localSponsored(): boolean {
  try {
    return Boolean(SPONSORED_ACCOUNT) && localStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
}
export function setLocalSponsored(on: boolean) {
  try {
    if (on) localStorage.setItem(STORE, "1");
    else localStorage.removeItem(STORE);
  } catch {
    /* private window: the setting lasts for this page only */
  }
}
