import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { getTrajectory, settledSamplesForTask } from "@/lib/server/db";
import { pathSignature, signatureDistance } from "@/lib/similarity";
import type { Sample } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The runs closest to this one, and how far away they are.
 *
 * The path overlay on a task shows every approach at once, which answers
 * whether the corpus is varied. This answers the narrower question a reader of
 * one run has: is this the ordinary way of doing this task, or an outlier?
 *
 * The same measure the verifier refuses duplicates with, so the number here
 * and the number in a rejection mean the same thing — a run reported as 14 mm
 * from its nearest neighbour is a run that only just got in.
 */
async function handleGET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ error: "hash must be 32 bytes" }, { status: 400 });
  }

  const run = await getTrajectory(hash);
  if (!run) return NextResponse.json({ error: "no trajectory with that hash" }, { status: 404 });

  const sig = pathSignature(JSON.parse(run.samples) as Sample[]);
  const others = (await settledSamplesForTask(run.task_id, 200))
    .filter((r) => r.traj_hash.toLowerCase() !== hash.toLowerCase())
    .map((r) => ({
      trajHash: r.traj_hash,
      distanceMm: Number(
        signatureDistance(sig, pathSignature(JSON.parse(r.samples) as Sample[])).toFixed(2),
      ),
    }))
    .sort((a, b) => a.distanceMm - b.distanceMm);

  return NextResponse.json({
    trajHash: hash,
    taskId: run.task_id,
    // Null rather than an empty list when this is the only paid run on the
    // task: "nothing to compare against" and "nothing close" are different.
    nearest: others[0] ?? null,
    neighbours: others.slice(0, 5),
  });
}

export const GET = logged("/api/trajectory/[hash]/similar", handleGET);
