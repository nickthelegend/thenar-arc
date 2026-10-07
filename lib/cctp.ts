/**
 * Circle CCTP V2: operators take their Arc earnings to any chain.
 *
 * An operator is paid in USDC on Arc, in the block that records their run.
 * To withdraw it they burn it on Arc with
 * `TokenMessengerV2.depositForBurn(amount, destinationDomain, mintRecipient, …)`,
 * Circle's Iris service attests the burn, and anyone calls
 * `MessageTransmitterV2.receiveMessage(message, attestation)` on the
 * destination to mint native USDC there. No bridge liquidity, no wrapped
 * token: Circle burns and mints the same USDC.
 *
 * Fast transfers (`minFinalityThreshold` 1000) attest in seconds for a small
 * fee capped by `maxFee`; standard (2000) waits for finality and is free.
 * Arc's own finality is sub-second, so the wait is on the attestation only.
 *
 * Pure and browser-safe (ABIs, calldata, Iris URLs and parsing). The
 * withdraw panel on /portfolio and scripts/cctp-withdraw.mjs do the I/O.
 * Adapted from xorv-arc.
 */
import { getAddress, pad, type Address, type Hex } from "viem";

export type CctpNetwork = "testnet" | "mainnet";

/** Where Arc earnings can go, with each chain's CCTP domain and its USDC. */
export interface RemoteChain {
  key: string;
  name: string;
  chainId: number;
  cctpDomain: number;
  usdc: Address;
  messageTransmitterV2: Address;
  explorer: string;
}

export const CCTP_DESTINATIONS: Record<CctpNetwork, RemoteChain[]> = {
  testnet: [
    { key: "base-sepolia", name: "Base Sepolia", chainId: 84532, cctpDomain: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", explorer: "https://sepolia.basescan.org" },
    { key: "ethereum-sepolia", name: "Ethereum Sepolia", chainId: 11155111, cctpDomain: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", explorer: "https://sepolia.etherscan.io" },
    { key: "arbitrum-sepolia", name: "Arbitrum Sepolia", chainId: 421614, cctpDomain: 3, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", messageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", explorer: "https://sepolia.arbiscan.io" },
  ],
  mainnet: [
    { key: "base", name: "Base", chainId: 8453, cctpDomain: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", messageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", explorer: "https://basescan.org" },
    { key: "ethereum", name: "Ethereum", chainId: 1, cctpDomain: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", messageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", explorer: "https://etherscan.io" },
    { key: "arbitrum", name: "Arbitrum", chainId: 42161, cctpDomain: 3, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", messageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", explorer: "https://arbiscan.io" },
  ],
};

/** Arc's side of CCTP V2. */
export const ARC_CCTP = {
  domain: 26,
  testnet: { tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Address, iris: "https://iris-api-sandbox.circle.com" },
  mainnet: { tokenMessengerV2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as Address, iris: "https://iris-api.circle.com" },
} as const;

export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";

export const TOKEN_MESSENGER_V2_ABI = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "DepositForBurn",
    inputs: [
      { name: "burnToken", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "depositor", type: "address", indexed: true },
      { name: "mintRecipient", type: "bytes32", indexed: false },
      { name: "destinationDomain", type: "uint32", indexed: false },
      { name: "destinationTokenMessenger", type: "bytes32", indexed: false },
      { name: "destinationCaller", type: "bytes32", indexed: false },
      { name: "maxFee", type: "uint256", indexed: false },
      { name: "minFinalityThreshold", type: "uint32", indexed: true },
      { name: "hookData", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

/** CCTP V2 finality thresholds. */
export const CCTP_FAST = 1000;
export const CCTP_STANDARD = 2000;

/** An address as CCTP's bytes32 mint recipient / caller. */
export function addressToBytes32(a: Address): Hex {
  return pad(getAddress(a), { size: 32 }).toLowerCase() as Hex;
}

export interface CctpWithdrawPlan {
  destination: RemoteChain;
  amount: bigint;
  recipient: Address;
  maxFee: bigint;
  minFinalityThreshold: number;
  tokenMessenger: Address;
  usdc: Address;
  /** The depositForBurn arguments, in order. */
  args: readonly [bigint, number, Hex, Address, Hex, bigint, number];
}

/**
 * Plan a burn on Arc that mints `amount` (minus at most `maxFee`) to
 * `recipient` on `destination`. `fast` uses the fast-transfer threshold; its
 * `maxFee` defaults to 1% of the amount, at least 0.01 USDC (Circle charges
 * its published fee, never more than the cap). Amounts are USDC base units.
 */
export function planCctpWithdraw(
  network: CctpNetwork,
  opts: { destination: RemoteChain; amount: bigint; recipient: Address; fast?: boolean; maxFee?: bigint },
): CctpWithdrawPlan {
  if (opts.amount <= 0n) throw new Error("withdraw amount must be positive");
  const fast = opts.fast ?? false;
  const maxFee = opts.maxFee ?? (fast ? (opts.amount / 100n > 10_000n ? opts.amount / 100n : 10_000n) : 0n);
  if (maxFee >= opts.amount) throw new Error("maxFee must be below the amount");
  const threshold = fast ? CCTP_FAST : CCTP_STANDARD;
  const tokenMessenger = ARC_CCTP[network].tokenMessengerV2;
  return {
    destination: opts.destination,
    amount: opts.amount,
    recipient: getAddress(opts.recipient),
    maxFee,
    minFinalityThreshold: threshold,
    tokenMessenger,
    usdc: ARC_USDC,
    args: [opts.amount, opts.destination.cctpDomain, addressToBytes32(opts.recipient), ARC_USDC, `0x${"0".repeat(64)}` as Hex, maxFee, threshold] as const,
  };
}

/** Iris v2: the messages (and attestations) a burn on Arc produced. */
export function irisMessagesUrl(network: CctpNetwork, txHash: Hex, sourceDomain = ARC_CCTP.domain): string {
  return `${ARC_CCTP[network].iris}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
}

export interface IrisMessage {
  status: "pending_confirmations" | "complete" | string;
  message: Hex | null;
  attestation: Hex | null;
}

/** Parse Iris's `/v2/messages` answer; `[]` when it hasn't seen the burn yet. */
export function parseIrisMessages(json: unknown): IrisMessage[] {
  const list = (json as { messages?: unknown[] } | null)?.messages;
  if (!Array.isArray(list)) return [];
  return list.map((m) => {
    const o = m as Record<string, unknown>;
    const hex = (v: unknown): Hex | null => (typeof v === "string" && v.startsWith("0x") && v !== "0x" ? (v as Hex) : null);
    return { status: String(o.status ?? "unknown"), message: hex(o.message), attestation: o.attestation === "PENDING" ? null : hex(o.attestation) };
  });
}
