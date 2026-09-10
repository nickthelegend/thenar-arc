import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { corpusIndex } from "@/lib/server/db";
import { ACCEPT_FLOOR } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything recorded on this deployment, in one list.
 *
 * The task pages answer "what is in this task". Nothing answered "what is in
 * the corpus", which is the question somebody deciding whether to licence any
 * of it is actually asking — and answering it meant opening six pages and
 * adding up.
 *
 * Failures are in here, labelled. Leaving them out would be the survivorship
 * filter this project just spent the effort removing.
 */
async function handleGET(req: Request) {
  const q = new URL(req.url).searchParams;

  const outcomeParam = q.get("outcome") ?? "all";
  if (!["all", "paid", "failed", "unsubmitted"].includes(outcomeParam)) {
    return NextResponse.json(
      { error: "outcome must be all, paid, failed or unsubmitted" },
      { status: 400 },
    );
  }

  const taskParam = q.get("taskId");
  if (taskParam !== null && !/^\d+$/.test(taskParam)) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }

  const minParam = q.get("minScore");
  if (minParam !== null && !/^\d+$/.test(minParam)) {
    return NextResponse.json({ error: "minScore must be an integer in 0..10000" }, { status: 400 });
  }

  const rows = await corpusIndex({
    outcome: outcomeParam as "all" | "paid" | "failed" | "unsubmitted",
    floor: ACCEPT_FLOOR,
    taskId: taskParam === null ? undefined : Number(taskParam),
    minScore: minParam === null ? undefined : Number(minParam),
    limit: 300,
  });

  return NextResponse.json({
    floor: ACCEPT_FLOOR,
    count: rows.length,
    episodes: rows.map((r) => ({
      trajHash: r.traj_hash,
      taskId: r.task_id,
      contributor: r.contributor,
      score: r.score,
      deviationMm: r.deviation_mm,
      durationSeconds: r.duration_s,
      frames: r.sample_count,
      createdAt: r.created_at,
      // Three states, not two. "Not paid" covers a run that failed and a run
      // whose operator never signed, and those say different things.
      outcome: r.settled === 1 ? "paid" : r.score < ACCEPT_FLOOR ? "failed" : "unsubmitted",
      txHash: r.tx_hash,
    })),
  });
}

export const GET = logged("/api/corpus", handleGET);
