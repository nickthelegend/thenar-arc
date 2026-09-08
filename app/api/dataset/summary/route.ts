import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { appChain } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a licence actually buys, without shipping it.
 *
 * A buyer deciding whether to pay should see the corpus before paying for it,
 * and the export is thousands of frames — too much to fetch to answer "is this
 * worth it". This reads the same rows the export reads and returns only the
 * shape: how many episodes, how many frames, how the scores fall, how many
 * distinct contributors, and the span the recordings cover.
 *
 * Scoped to settled runs on the active chain, exactly as the export is, so the
 * summary describes the file the buyer would receive and not a larger set.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("taskId");
  if (raw === null || raw.trim() === "") {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }
  const taskId = Number(raw);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: `taskId must be a non-negative integer, got "${raw}"` }, { status: 400 });
  }

  const rows = await query<{
    contributor: string; score: number; deviation_mm: number;
    duration_s: number; sample_count: number; created_at: number;
  }>(
    `SELECT contributor, score, deviation_mm, duration_s, sample_count, created_at
       FROM trajectory
      WHERE task_id = ? AND settled = 1 AND chain_id = ?
      ORDER BY created_at ASC`,
    [taskId, appChain.id],
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "No trajectories recorded for that task." }, { status: 404 });
  }

  const scores = rows.map((r) => r.score).sort((a, b) => a - b);
  const at = (q: number) => scores[Math.min(scores.length - 1, Math.floor(q * scores.length))];

  // Ten buckets across the payable range, which is where every stored run sits.
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    from: 4000 + i * 600,
    to: 4000 + (i + 1) * 600,
    n: 0,
  }));
  for (const s of scores) {
    const i = Math.min(9, Math.max(0, Math.floor((s - 4000) / 600)));
    buckets[i].n += 1;
  }

  return NextResponse.json({
    taskId,
    episodes: rows.length,
    frames: rows.reduce((n, r) => n + r.sample_count, 0),
    frequencyHz: 20,
    contributors: new Set(rows.map((r) => r.contributor.toLowerCase())).size,
    score: {
      min: scores[0],
      median: at(0.5),
      p90: at(0.9),
      max: scores[scores.length - 1],
      mean: Math.round(scores.reduce((n, s) => n + s, 0) / scores.length),
    },
    deviationMm: {
      mean: rows.reduce((n, r) => n + Math.abs(r.deviation_mm), 0) / rows.length,
    },
    seconds: {
      total: rows.reduce((n, r) => n + r.duration_s, 0),
      mean: rows.reduce((n, r) => n + r.duration_s, 0) / rows.length,
    },
    recordedFrom: rows[0].created_at,
    recordedTo: rows[rows.length - 1].created_at,
    distribution: buckets,
  });
}
