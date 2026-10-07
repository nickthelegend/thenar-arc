import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { tasksWithEpisodes, trajectoriesForTask } from "@/lib/server/db";
import { leavesOf } from "@/lib/merkle";
import { appChain, AXON_ADDRESS, CORPUS_MANIFEST } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The most tasks one answer lists; an auditor pages with ?tasks=. */
const MAX_TASKS = 25;

/**
 * Every paid episode this server would sell, task by task, as bare hashes.
 *
 * /api/task/{id}/manifest says what root this server computes. This says what
 * it computes it from, so someone else can compute it: the Chainlink CRE
 * workflow in cre/corpus-audit fetches this on every node of its DON, each
 * node builds the Merkle root itself, and the DON compares the agreed root
 * with the one the verifier committed to CorpusManifest on chain. The leaves
 * are exactly the ones the manifest route hashes (same query, same limit,
 * sorted and deduplicated as lib/merkle.ts does).
 *
 *   ?tasks=0,3,7   only these tasks (at most 25)
 */
async function handleGET(req: Request) {
  const raw = new URL(req.url).searchParams.get("tasks");
  let ids: number[];
  if (raw !== null) {
    const parts = raw.split(",").filter(Boolean);
    if (!parts.length || parts.length > MAX_TASKS || !parts.every((p) => /^\d+$/.test(p))) {
      return NextResponse.json({ error: `tasks must be 1 to ${MAX_TASKS} comma-separated task ids` }, { status: 400 });
    }
    ids = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  } else {
    ids = await tasksWithEpisodes(MAX_TASKS);
  }
  const tasks = [];
  for (const taskId of ids) {
    const runs = await trajectoriesForTask(taskId, 500);
    tasks.push({ taskId, episodes: leavesOf(runs.map((r) => r.traj_hash)) });
  }
  return NextResponse.json(
    { chainId: appChain.id, protocol: AXON_ADDRESS, manifest: CORPUS_MANIFEST || null, tasks },
    { headers: { "cache-control": "public, max-age=15" } },
  );
}

export const GET = logged("/api/corpus/episodes", handleGET);
