#!/usr/bin/env node
/**
 * Commit a task's corpus contents to the chain.
 *
 *     node --import ./test/register.mjs scripts/commit-manifest.mjs <taskId> [baseUrl]
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
import { createPublicClient, createWalletClient, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootOf, proofFor, verifyProof } from "../lib/merkle.ts";
import { appChain as chain, transport, ADDR, env, need, txUrl } from "./monad.mjs";

const TASK = Number(process.argv[2] ?? 0);
const BASE = process.argv[3] ?? "http://localhost:3222";

// The manifest the app reads, from lib/deployment.ts unless .env.local or the
// environment says otherwise. MANIFEST_ADDRESS stays as an override for
// committing against a contract the app is not pointed at yet.
const MANIFEST = need(
  process.env.MANIFEST_ADDRESS ?? ADDR.corpusManifest,
  "CorpusManifest's address (lib/deployment.ts, NEXT_PUBLIC_CORPUS_MANIFEST or MANIFEST_ADDRESS)",
);
const abi = parseAbi([
  "function commit(uint256 taskId, bytes32 root, uint32 episodes)",
  "function latest(uint256 taskId) view returns ((bytes32 root, uint32 episodes, uint64 at))",
  "function versions(uint256 taskId) view returns (uint256)",
  "function contains(uint256 taskId, bytes32 episode, bytes32[] proof) view returns (bool)",
]);

const pub = createPublicClient({ chain, transport: transport() });
const verifier = privateKeyToAccount(
  need(env("VERIFIER_PRIVATE_KEY"), "VERIFIER_PRIVATE_KEY").replace(/^"|"$/g, ""),
);
const w = createWalletClient({ account: verifier, chain, transport: transport() });

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

// Monad charges for the gas limit, not the gas used, so a flat ceiling picked
// to be safe is paid in full every time. Ask what this commit costs and leave
// a fifth over for the state to move between the estimate and the block.
const call = { address: MANIFEST, abi, functionName: "commit", args: [BigInt(TASK), root, hashes.length] };
const estimate = await pub.estimateContractGas({ ...call, account: verifier });
const hash = await w.writeContract({ ...call, gas: (estimate * 12n) / 10n });
const rec = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
console.log(`  committed: ${rec.status} | ${txUrl(hash)}`);

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
