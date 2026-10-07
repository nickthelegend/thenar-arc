import { bytesToHex, concatHex, decodeFunctionResult, encodeFunctionData, type Hex } from "viem";

/**
 * Reading Monad testnet itself: the parts of the chain that exist only on
 * Monad, and the shared contracts every Monad app can lean on.
 *
 * Read-only, from the page, over the public RPC: nothing here signs or sends.
 * Used by /network, and labelled there as a live read of Monad testnet on
 * every build, the local one included.
 */

export const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://testnet-rpc.monad.xyz";

export const STAKING = "0x0000000000000000000000000000000000001000" as const;
export const P256_VERIFY = "0x0000000000000000000000000000000000000100" as const;

/**
 * The staking precompile's reads, from docs.monad.xyz/reference/staking/api.
 * Declared nonpayable, not view: the precompile answers only CALL, which an
 * eth_call is, and refuses STATICCALL, which a view call from a contract is.
 */
export const STAKING_ABI = [
  { type: "function", name: "getEpoch", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "epoch", type: "uint64" }, { name: "inEpochDelayPeriod", type: "bool" }] },
  { type: "function", name: "getProposerValId", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "val_id", type: "uint64" }] },
  {
    type: "function", name: "getValidator", stateMutability: "nonpayable",
    inputs: [{ name: "validatorId", type: "uint64" }],
    outputs: [
      { name: "authAddress", type: "address" }, { name: "flags", type: "uint64" }, { name: "stake", type: "uint256" },
      { name: "accRewardPerToken", type: "uint256" }, { name: "commission", type: "uint256" }, { name: "unclaimedRewards", type: "uint256" },
      { name: "consensusStake", type: "uint256" }, { name: "consensusCommission", type: "uint256" }, { name: "snapshotStake", type: "uint256" },
      { name: "snapshotCommission", type: "uint256" }, { name: "secpPubkey", type: "bytes" }, { name: "blsPubkey", type: "bytes" },
    ],
  },
] as const;

export const callData = {
  getEpoch: () => encodeFunctionData({ abi: STAKING_ABI, functionName: "getEpoch" }),
  getProposerValId: () => encodeFunctionData({ abi: STAKING_ABI, functionName: "getProposerValId" }),
  getValidator: (id: bigint) => encodeFunctionData({ abi: STAKING_ABI, functionName: "getValidator", args: [id] }),
};

export const decode = {
  getEpoch: (data: Hex) => decodeFunctionResult({ abi: STAKING_ABI, functionName: "getEpoch", data }),
  getProposerValId: (data: Hex) => decodeFunctionResult({ abi: STAKING_ABI, functionName: "getProposerValId", data }),
  getValidator: (data: Hex) => decodeFunctionResult({ abi: STAKING_ABI, functionName: "getValidator", data }),
};

/** Commission is a fraction times 1e18 (10% is 1e17); as a percentage. */
export const commissionPct = (c: bigint) => Number((c * 10_000n) / 10n ** 18n) / 100;

/** EIP-7951 / RIP-7212 input: hash ‖ r ‖ s ‖ qx ‖ qy, 160 bytes. */
export function p256Input(hash: Uint8Array, signature: Uint8Array, publicKeyRaw: Uint8Array): Hex {
  if (hash.length !== 32 || signature.length !== 64 || publicKeyRaw.length !== 65 || publicKeyRaw[0] !== 4) {
    throw new Error("P-256 input needs a 32-byte hash, a 64-byte r‖s signature and an uncompressed public key");
  }
  return concatHex([bytesToHex(hash), bytesToHex(signature), bytesToHex(publicKeyRaw.slice(1))]);
}

/** The precompile answers 32 bytes ending in 1 for a valid signature, and nothing at all for an invalid one. */
export const p256Valid = (result: Hex) => /^0x0{63}1$/.test(result);

export type Canonical = { name: string; address: `0x${string}`; use: string };

/** Shared contracts on Monad testnet (docs.monad.xyz, checked on 7 Oct), and what Thenar does with each. */
export const CANONICAL: Canonical[] = [
  { name: "Multicall3", address: "0xcA11bde05977b3631167028862bE2a173976CA11", use: "Thenar reads every task, run and history through it in one call (lib/chain.ts)." },
  { name: "USDC (Circle)", address: "0x534b2f3A21130d7a60830c2Df862319e593943A3", use: "What agents pay in over x402 (lib/agent-corpus.ts)." },
  { name: "x402 ExactPermit2Proxy", address: "0x402085c248EeA27D92E8b30b2C58ed07f9E20001", use: "x402's Permit2 route; Thenar's USDC payments use EIP-3009 instead, which USDC supports natively." },
  { name: "Deterministic deployer (CREATE2)", address: "0x4e59b44847b379578588920cA78FbF26c0B4956C", use: "Puts SponsoredAccount at the same address on every chain (scripts/localnet.mjs)." },
  { name: "WMON", address: "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541", use: "Not needed: escrow and payouts are native MON." },
  { name: "Permit2", address: "0x000000000022d473030f116ddee9f6b43ac78ba3", use: "Not needed: no ERC-20 approvals in Thenar's flows." },
  { name: "CreateX", address: "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed", use: "Available for deterministic deploys; Thenar's are scripted with Foundry." },
  { name: "EntryPoint v0.7", address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", use: "ERC-4337. Thenar sponsors gas with EIP-7702 (Privy on Monad, SponsoredAccount locally), not a bundler." },
  { name: "EntryPoint v0.8", address: "0x4337084d9e255fF0702461CF8895cE9E3b5Ff108", use: "ERC-4337, current version. Not used, for the same reason as v0.7." },
  { name: "ERC-6492 UniversalSigValidator", address: "0xdAcD51A54883eb67D95FAEb2BBfdC4a9a6BD2a3B", use: "Checks signatures from undeployed smart accounts; Thenar's delegated wallets answer EIP-1271 directly." },
];

export type RpcCall = { method: string; params: unknown[] };

/** A JSON-RPC batch to Monad testnet. A 429 is reported as such, so the page can back off. */
export async function monadBatch(calls: RpcCall[], signal?: AbortSignal): Promise<{ result?: unknown; error?: { message: string } }[]> {
  const r = await fetch(MONAD_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }))),
    signal,
  });
  if (r.status === 429) throw Object.assign(new Error("Monad's public RPC is rate-limiting this page"), { rateLimited: true });
  if (!r.ok) throw new Error(`Monad's RPC answered ${r.status}`);
  const body = (await r.json()) as { id: number; result?: unknown; error?: { message: string } }[];
  const out = new Array(calls.length);
  for (const x of body) out[x.id] = x;
  return out;
}
