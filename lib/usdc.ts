import { formatUnits, parseUnits } from "viem";

/**
 * USDC amounts. Every amount a Thenar contract holds or pays — a bounty, its
 * escrow, a payout, a licence fee, a dividend, an x402 price — is in Circle's
 * USDC ERC-20 base units: 6 decimals. Gas, and a wallet's native balance from
 * `getBalance`, is the same USDC at 18 decimals; use `formatNative` for that.
 *
 * No imports from the app: scripts load this with Node.
 */
export const USDC_DECIMALS = 6;
export const NATIVE_DECIMALS = 18;

/** Base units (6 dec) to a decimal string: 1500000n → "1.5". */
export const formatUsdc = (units: bigint | number | string) => formatUnits(BigInt(units), USDC_DECIMALS);

/** A decimal string to base units (6 dec): "1.5" → 1500000n. */
export const parseUsdc = (amount: string) => parseUnits(amount, USDC_DECIMALS);

/** A native balance (18 dec, from getBalance) to a decimal string. */
export const formatNative = (wei: bigint) => formatUnits(wei, NATIVE_DECIMALS);

/** For display: "1.50 USDC", with at most `max` decimals and at least two. */
export function usdcLabel(units: bigint | number | string, max = 4): string {
  const n = Number(formatUsdc(units));
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: max })} USDC`;
}

/** Native 18-dec balance to 6-dec base units (truncating), for comparing with contract amounts. */
export const nativeToUsdcUnits = (wei: bigint) => wei / 10n ** 12n;

export const USDC_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * EIP-3009 on Circle's USDC ("USDC" / "2"): what a sponsor signs to fund a
 * task through ThenarProtocol.createTaskWithAuthorization (the protocol is the
 * payee and must be the caller, so it is `ReceiveWithAuthorization`).
 */
export const USDC_EIP712_DOMAIN = { name: "USDC", version: "2" } as const;
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
