import { NextResponse } from "next/server";

import { chainClient } from "@/lib/rpc";
import { logged } from "@/lib/server/log";
import { trajectoriesForTask } from "@/lib/server/db";
import { rootOf, proofFor } from "@/lib/merkle";
import { appChain, CORPUS_MANIFEST } from "@/lib/chain";

/**
 * CorpusAudit, where the Chainlink CRE workflow in cre/corpus-audit writes
 * what its DON found. Server-side and optional: until a receiver is deployed
 * and named here, the manifest simply has no audit to report.
 */
const CORPUS_AUDIT = /^0x[0-9a-fA-F]{40}$/.test(process.env.CORPUS_AUDIT ?? "") ? (process.env.CORPUS_AUDIT as `0x${string}`) : null;
const VERDICTS = ["uncommitted", "matches", "grown", "short", "altered"] as const;
const AUDIT_ABI = [
  {
    type: "function", name: "latest", stateMutability: "view",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "servedRoot", type: "bytes32" },
        { name: "committedRoot", type: "bytes32" },
        { name: "served", type: "uint32" },
        { name: "committed", type: "uint32" },
        { name: "verdict", type: "uint8" },
        { name: "observedAt", type: "uint64" },
        { name: "blockNumber", type: "uint64" },
      ],
    }],
  },
] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

const ABI = [
  {
    type: "function", name: "latest", stateMutability: "view",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "root", type: "bytes32" },
        { name: "episodes", type: "uint32" },
        { name: "at", type: "uint64" },
      ],
    }],
  },
] as const;

/**
 * What this task's corpus contains, and the proof for one episode of it.
 *
 * Two roots come back and they are not the same claim. `computed` is derived
 * here, right now, from the episodes this server would hand you. `committed`
 * is what the verifier put on chain. A buyer cares about the second and should
 * check it against the first — if they differ, the corpus has grown since it
 * was committed, or something is missing from what you are being served, and
 * the point of publishing both is that you do not have to take our word for
 * which.
 *
 * The proof is included so the check can be finished in a browser: leaf,
 * siblings, root, and no request back to us.
 */
async function handleGET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }

  const episode = new URL(req.url).searchParams.get("episode");
  if (episode !== null && !/^0x[0-9a-fA-F]{64}$/.test(episode)) {
    return NextResponse.json({ error: "episode must be a 32-byte hash" }, { status: 400 });
  }

  const runs = await trajectoriesForTask(taskId, 500);
  const hashes = runs.map((r) => r.traj_hash);
  const computed = hashes.length ? rootOf(hashes) : null;

  let committed: { root: string; episodes: number; at: number } | null = null;
  // With no manifest contract configured there is nothing to read, and asking
  // an empty address answered as if a contract had simply never been committed to.
  if (CORPUS_MANIFEST) {
    try {
      const c = await client.readContract({
        address: CORPUS_MANIFEST, abi: ABI, functionName: "latest", args: [BigInt(taskId)],
      });
      committed = { root: c.root, episodes: Number(c.episodes), at: Number(c.at) };
    } catch {
      // NoCommitment is the ordinary answer for a task nobody has committed yet,
      // and it is not an error worth a 500 — the corpus simply has no commitment.
      committed = null;
    }
  }

  // What a Chainlink DON last found, independently of this server's own sums.
  let audit: Record<string, unknown> | null = null;
  if (CORPUS_AUDIT) {
    try {
      const a = await client.readContract({ address: CORPUS_AUDIT, abi: AUDIT_ABI, functionName: "latest", args: [BigInt(taskId)] });
      if (a.observedAt > BigInt(0)) {
        audit = {
          contract: CORPUS_AUDIT, by: "Chainlink CRE (cre/corpus-audit)",
          verdict: VERDICTS[a.verdict] ?? "unknown", servedRoot: a.servedRoot, committedRoot: a.committedRoot,
          served: a.served, committed: a.committed, observedAt: Number(a.observedAt), block: Number(a.blockNumber),
        };
      }
    } catch {
      audit = null;
    }
  }

  return NextResponse.json({
    taskId,
    contract: CORPUS_MANIFEST || null,
    ...(CORPUS_MANIFEST ? {} : { note: "No CorpusManifest contract is deployed on this chain, so there is no on-chain root to compare against." }),
    chainId: appChain.id,
    episodes: hashes.length,
    computed,
    committed,
    // Null when there is nothing to compare — no episodes, or no root committed
    // yet. false is reserved for a committed root the corpus disagrees with,
    // which is a finding; an absence is not.
    matches: committed && computed ? committed.root.toLowerCase() === computed.toLowerCase() : null,
    audit,
    ...(episode
      ? {
          episode,
          // Null when the hash is not in this task's corpus. That is an answer,
          // not a failure, and the caller should show it as one.
          proof: proofFor(hashes, episode),
        }
      : {}),
  });
}

export const GET = logged("/api/task/[id]/manifest", handleGET);
