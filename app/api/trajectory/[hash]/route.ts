import { NextResponse } from "next/server";
import { getTrajectory } from "@/lib/server/db";
import { canonicalise } from "@/lib/server/verifier";
import { keccak256, toHex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve a trajectory by the hash the chain recorded, and prove it: the stored
 * samples are re-canonicalised and re-hashed on every read, so a row that has
 * been tampered with reports itself.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  const row = await getTrajectory(hash);

  if (!row) {
    return NextResponse.json({ error: "No trajectory with that hash." }, { status: 404 });
  }

  const samples = JSON.parse(row.samples);
  // The scene is part of what was hashed on a run the instruction left open,
  // so it has to be part of what is hashed again here or the integrity badge
  // reports a mismatch on a row that is perfectly intact.
  const payloadIds: string[] | undefined = row.payload_ids
    ? (JSON.parse(row.payload_ids) as string[])
    : undefined;
  const recomputed = keccak256(
    toHex(canonicalise(row.task_id, row.contributor, samples, payloadIds)),
  );

  return NextResponse.json({
    trajHash: row.traj_hash,
    taskId: row.task_id,
    contributor: row.contributor,
    score: row.score,
    deviationMm: row.deviation_mm,
    durationSeconds: row.duration_s,
    parts: {
      placement: row.placement,
      efficiency: row.efficiency,
      smoothness: row.smoothness,
    },
    sampleCount: row.sample_count,
    createdAt: row.created_at,
    txHash: row.tx_hash,
    // Which chain that transaction is on. Without it the run page links every
    // hash to the current chain's explorer, archived ones included — the same
    // bug the feed had, one page over.
    chainId: row.chain_id,
    integrity: {
      recomputedHash: recomputed,
      matches: recomputed.toLowerCase() === row.traj_hash.toLowerCase(),
    },
    samples,
    // Which objects this run was actually driven against, when the instruction
    // did not name them. Null on every run whose scene its instruction fixed.
    payloadIds: payloadIds ?? null,
  });
}
