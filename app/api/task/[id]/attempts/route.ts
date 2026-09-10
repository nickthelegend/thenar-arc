import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { attemptsForTask } from "@/lib/server/db";
import { ACCEPT_FLOOR } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every attempt at a task, split by what became of it.
 *
 * The ledger everywhere else on this site is the paid corpus, which is the
 * right default — it is the thing the contract will vouch for. It is also a
 * survivorship filter, and a task page built only on it can report a mean
 * score of 94 for a task most people cannot do.
 *
 * Three outcomes, kept apart because two of them are not failures:
 *
 *   paid          scored at or above the floor and settled on chain
 *   failed        scored below the floor; the run happened and did not work
 *   unsubmitted   scored well enough and was never sent; the operator closed
 *                 the tab, rejected the wallet prompt, or ran out of gas
 *
 * A pass rate over paid ÷ (paid + failed) is a real number. One that counted
 * abandonments would move whenever somebody changed their mind, which is not a
 * property of the task.
 */
async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }

  const rows = await attemptsForTask(taskId, ACCEPT_FLOOR);
  const counts = { paid: 0, failed: 0, unsubmitted: 0 };
  for (const r of rows) counts[r.outcome as keyof typeof counts] += 1;

  const attempted = counts.paid + counts.failed;
  return NextResponse.json({
    taskId,
    floor: ACCEPT_FLOOR,
    counts,
    // Null rather than zero when nobody has attempted it: a task with no runs
    // has no pass rate, and 0% would read as one everybody failed.
    passRate: attempted > 0 ? counts.paid / attempted : null,
    attempts: rows.map((r) => ({
      trajHash: r.traj_hash,
      contributor: r.contributor,
      score: r.score,
      deviationMm: r.deviation_mm,
      durationSeconds: r.duration_s,
      createdAt: r.created_at,
      outcome: r.outcome,
    })),
  });
}

export const GET = logged("/api/task/[id]/attempts", handleGET);
