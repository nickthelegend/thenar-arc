import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { coherenceOf } from "@/lib/coherence";
import type { Sample } from "@/lib/types";
import { appChain, AXON_ADDRESS } from "@/lib/chain";

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
    duration_s: number; sample_count: number; created_at: number; samples: string;
  }>(
    `SELECT contributor, score, deviation_mm, duration_s, sample_count, created_at, samples
       FROM trajectory
      WHERE task_id = ? AND settled = 1 AND chain_id = ? AND contract = ?
      ORDER BY created_at ASC`,
    [taskId, appChain.id, AXON_ADDRESS.toLowerCase()],
  );

  /**
   * An empty corpus is a summary, not a missing resource.
   *
   * This answered 404, which is a status for a thing that is not there — and
   * the thing asked for is the shape of a task's corpus, which is there and is
   * empty. The consequence was a console error on every page that previews a
   * policy over a task this deployment holds no runs for, and a contract this
   * API's own OpenAPI document does not describe: it advertises 200 and 400
   * and nothing else.
   *
   * So the empty case answers with the same shape, zeroed, and says so in
   * `note`. A caller that draws a histogram gets ten empty buckets rather than
   * an exception, and a caller checking whether there is anything to buy reads
   * `episodes`.
   */
  if (rows.length === 0) {
    return NextResponse.json({
      taskId,
      episodes: 0,
      trainable: {
        episodes: 0,
        of: 0,
        note: "This deployment holds no settled runs for that task on the active contract.",
      },
      frames: 0,
      frequencyHz: 20,
      contributors: 0,
      score: { min: 0, median: 0, p90: 0, max: 0, mean: 0 },
      deviationMm: { mean: 0 },
      seconds: { total: 0, mean: 0 },
      recordedFrom: null,
      recordedTo: null,
      distribution: Array.from({ length: 10 }, (_, i) => ({
        from: 4000 + i * 600,
        to: 4000 + (i + 1) * 600,
        n: 0,
      })),
    });
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

  /**
   * How much of this corpus is a demonstration of anything.
   *
   * A trajectory carries the arm and the payload as independent columns, and
   * nothing in the format makes them agree: a run can report jaws closed while
   * the tool is two hundred millimetres from the object, and the hash, the
   * signature and the payout are all still valid. It is simply not usable as
   * training data, and a buyer has no way to see that from a score.
   *
   * Measured rather than assumed, and reported before the price.
   */
  const coherence = rows.map((r) => {
    try { return coherenceOf(JSON.parse(r.samples) as Sample[]); }
    catch { return null; }
  });
  const usable = coherence.filter((c) => c?.coherent).length;

  return NextResponse.json({
    taskId,
    episodes: rows.length,
    trainable: {
      episodes: usable,
      of: rows.length,
      note:
        usable === rows.length
          ? "In every episode the arm and the payload agree about what happened."
          : `${rows.length - usable} of ${rows.length} episodes record the jaws closed while the ` +
            "tool is too far from the payload to be holding it. Those are not demonstrations of " +
            "the task and should not be trained on.",
    },
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
