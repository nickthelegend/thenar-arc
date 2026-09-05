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
  const row = getTrajectory(hash);

  if (!row) {
    return NextResponse.json({ error: "No trajectory with that hash." }, { status: 404 });
  }

  const samples = JSON.parse(row.samples);
  const recomputed = keccak256(toHex(canonicalise(row.task_id, row.contributor, samples)));

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
    integrity: {
      recomputedHash: recomputed,
      matches: recomputed.toLowerCase() === row.traj_hash.toLowerCase(),
    },
    samples,
  });
}
