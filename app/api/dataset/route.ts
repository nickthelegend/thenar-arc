import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export a task's collected trajectories as a training set.
 *
 * Shaped the way an imitation-learning loader expects: one episode per
 * accepted run, each carrying its samples, its measured quality, and the
 * address that produced it — so provenance survives into the dataset rather
 * than being stripped at export.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("taskId");
  // Number(null) is 0, so an absent parameter would silently export task 0.
  if (raw === null || raw.trim() === "") {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }
  const taskId = Number(raw);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json(
      { error: `taskId must be a non-negative integer, got "${raw}"` },
      { status: 400 },
    );
  }

  const rows = getDb()
    .prepare(
      `SELECT traj_hash, contributor, score, deviation_mm, duration_s, samples, tx_hash, created_at
       FROM trajectory WHERE task_id = ? ORDER BY created_at ASC`,
    )
    .all(taskId) as {
    traj_hash: string; contributor: string; score: number; deviation_mm: number;
    duration_s: number; samples: string; tx_hash: string | null; created_at: number;
  }[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "No trajectories recorded for that task." }, { status: 404 });
  }

  const episodes = rows.map((r, i) => {
    const samples = JSON.parse(r.samples) as {
      t: number; q: number[]; grip: number; object: number[];
    }[];
    return {
      episode_index: i,
      trajectory_hash: r.traj_hash,
      contributor: r.contributor,
      transaction: r.tx_hash,
      quality_score: r.score / 10000,
      deviation_mm: r.deviation_mm,
      duration_s: r.duration_s,
      length: samples.length,
      frequency_hz: 20,
      observation: {
        "state.joints": samples.map((s) => s.q),
        "state.gripper": samples.map((s) => s.grip),
        "state.object_pose": samples.map((s) => s.object),
      },
      action: samples.map((s) => [...s.q, s.grip]),
      timestamp: samples.map((s) => s.t),
    };
  });

  const body = JSON.stringify(
    {
      dataset: `axon-task-${taskId}`,
      embodiment: "AXON-6",
      degrees_of_freedom: 6,
      gripper: "parallel-jaw, 42 mm",
      control_frequency_hz: 20,
      episodes: episodes.length,
      total_frames: episodes.reduce((n, e) => n + e.length, 0),
      exported_at: new Date().toISOString(),
      data: episodes,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="axon-task-${taskId}.json"`,
    },
  });
}
