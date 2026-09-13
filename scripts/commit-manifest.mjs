#!/usr/bin/env node
/**
 * Commit a task's corpus contents to the chain.
 *
 *     node scripts/commit-manifest.mjs <taskId> [baseUrl]
 *
 * The protocol records each accepted run's hash as it happens, which proves
 * every episode is real and says nothing about the set. This commits one hash
 * over the whole set, so a buyer can check the corpus they downloaded is the
 * corpus that was sold, and prove any single episode belongs to it without
 * downloading the rest.
 *
 * Signed by the verifier key, because the contract will accept it from nobody
 * else: the party that decides what an episode is worth is the party that says
 * which episodes there were.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootOf, proofFor, verifyProof } from "../lib/merkle.ts";

const TASK = Number(process.argv[2] ?? 0);
const BASE = process.argv[3] ?? "http://localhost:3222";

const envOf = (f) =>
  Object.fromEntries(
    readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );

// Ported to Arc: this still named the Fuji manifest and signed on Fuji, where
// the verifier holds nothing, so no Arc corpus had ever been committed.
const MANIFEST = process.env.MANIFEST_ADDRESS
  ?? envOf(".env.local").NEXT_PUBLIC_CORPUS_MANIFEST
  ?? "0x956f1Bf0dd1CE3Af862388E643e708c4C37148f8";
const abi = parseAbi([
  "function commit(uint256 taskId, bytes32 root, uint32 episodes)",
  "function latest(uint256 taskId) view returns ((bytes32 root, uint32 episodes, uint64 at))",
  "function versions(uint256 taskId) view returns (uint256)",
  "function contains(uint256 taskId, bytes32 episode, bytes32[] proof) view returns (bool)",
]);

const chain = {
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
};
const pub = createPublicClient({ chain, transport: http() });
const verifier = privateKeyToAccount(
  envOf(".env.local").VERIFIER_PRIVATE_KEY.replace(/^"|"$/g, ""),
);
const w = createWalletClient({ account: verifier, chain, transport: http() });

// The accepted corpus, read from the same surface a buyer downloads.
const runs = (await (await fetch(`${BASE}/api/task/${TASK}/runs`)).json()).runs ?? [];
const hashes = runs.map((r) => r.traj_hash);
if (hashes.length === 0) {
  console.log(`task ${TASK} has no accepted episodes; nothing to commit`);
  process.exit(1);
}

const root = rootOf(hashes);
console.log(`task ${TASK}: ${hashes.length} episodes`);
console.log(`  root computed here: ${root}`);

const already = await pub.readContract({ address: MANIFEST, abi, functionName: "versions", args: [BigInt(TASK)] });
if (already > 0n) {
  const cur = await pub.readContract({ address: MANIFEST, abi, functionName: "latest", args: [BigInt(TASK)] });
  if (cur.root.toLowerCase() === root.toLowerCase()) {
    console.log("  already committed and unchanged; nothing to do");
    process.exit(0);
  }
}

const hash = await w.writeContract({
  address: MANIFEST, abi, functionName: "commit",
  args: [BigInt(TASK), root, hashes.length], gas: 200_000n,
});
const rec = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`  committed: ${rec.status} | tx ${hash}`);

// The cross-check that matters: a proof built by lib/merkle.ts, verified by the
// contract's own walk. Two implementations of the same tree in two languages
// is exactly where a commitment quietly stops meaning anything.
const sample = hashes[0];
const proof = proofFor(hashes, sample);
const locally = verifyProof(sample, proof, root);
const onChain = await pub.readContract({
  address: MANIFEST, abi, functionName: "contains",
  args: [BigInt(TASK), sample, proof],
});
console.log(`  proof for ${sample.slice(0, 14)}… — in the browser: ${locally}, on chain: ${onChain}`);
if (!locally || !onChain) process.exit(1);
