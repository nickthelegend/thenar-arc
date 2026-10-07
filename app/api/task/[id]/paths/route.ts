import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { appChain, AXON_ADDRESS } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Points kept per run. Enough to read the shape of an approach, small enough
 *  that a task with fifty runs is still one modest response. */
const POINTS = 40;

/**
 * Every accepted approach to one task, as paths.
 *
 * A score distribution says how well people did. It does not say *how* — whether
 * the good runs share a route and the poor ones wander, or whether there are two
 * equally good approaches. Overlaying the paths is the only way to see that, and
 * it is exactly what a buyer evaluating a corpus wants to know about its
 * diversity.
 *
 * Downsampled by even stride rather than truncated, so a long run keeps its
 * whole shape instead of its first two seconds.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }

  const rows = await query<{
    traj_hash: string; contributor: string; score: number; samples: string;
  }>(
    `SELECT traj_hash, contributor, score, samples
       FROM trajectory
      WHERE task_id = ? AND settled = 1 AND chain_id = ? AND contract = ?
      ORDER BY score DESC`,
    [taskId, appChain.id, AXON_ADDRESS.toLowerCase()],
  );

  const paths = rows.map((r) => {
    const s = JSON.parse(r.samples) as { object: [number, number, number] }[];
    const stride = Math.max(1, Math.floor(s.length / POINTS));
    const pts: [number, number][] = [];
    for (let i = 0; i < s.length; i += stride) pts.push([s[i].object[0], s[i].object[1]]);
    // Always finish where the run finished — the last point is the placement.
    const last = s[s.length - 1]?.object;
    if (last) pts.push([last[0], last[1]]);
    return {
      trajHash: r.traj_hash,
      contributor: r.contributor,
      score: r.score,
      points: pts.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]),
    };
  });

  return NextResponse.json({ taskId, runs: paths.length, paths });
}
