import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/server/db";
import { appChain } from "@/lib/chain";

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
  // A single run, for anyone who wants one episode rather than a corpus — the
  // page that shows a run should be able to hand you the same run as data.
  const one = url.searchParams.get("traj");
  if (one) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(one)) {
      return NextResponse.json({ error: "traj must be a 32-byte hash" }, { status: 400 });
    }
    const row = await queryOne<{
      traj_hash: string; task_id: number; contributor: string; score: number;
      deviation_mm: number; duration_s: number; samples: string;
      tx_hash: string | null; created_at: number;
    }>(
      `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
              samples, tx_hash, created_at
         FROM trajectory
        WHERE traj_hash = ? AND settled = 1 AND chain_id = ?`,
      [one, appChain.id],
    );

    if (!row) {
      return NextResponse.json({ error: "No settled trajectory with that hash on this chain." }, { status: 404 });
    }

    const samples = JSON.parse(row.samples) as {
      t: number; q: number[]; grip: number; object: number[];
    }[];

    const body = JSON.stringify({
      dataset: `thenar-run-${row.traj_hash.slice(0, 10)}`,
      embodiment: "THENAR-6",
      degrees_of_freedom: 6,
      gripper: "parallel-jaw, 42 mm",
      control_frequency_hz: 20,
      episodes: 1,
      total_frames: samples.length,
      exported_at: new Date().toISOString(),
      data: [{
        episode_index: 0,
        trajectory_hash: row.traj_hash,
        task_id: row.task_id,
        contributor: row.contributor,
        transaction: row.tx_hash,
        quality_score: row.score / 10000,
        deviation_mm: row.deviation_mm,
        duration_s: row.duration_s,
        length: samples.length,
        frequency_hz: 20,
        observation: {
          "state.joints": samples.map((s) => s.q),
          "state.gripper": samples.map((s) => s.grip),
          "state.object_pose": samples.map((s) => s.object),
        },
        action: samples.map((s) => [...s.q, s.grip]),
        timestamp: samples.map((s) => s.t),
      }],
    }, null, 2);

    return new NextResponse(body, {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="thenar-run-${row.traj_hash.slice(0, 10)}.json"`,
      },
    });
  }

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

  const rows = await query<{
    traj_hash: string; contributor: string; score: number; deviation_mm: number;
    duration_s: number; samples: string; tx_hash: string | null; created_at: number;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s, samples, tx_hash, created_at
     -- Scoped to the chain this deployment settles on. A corpus that mixed
     -- in runs paid on a previous chain would carry transaction hashes a
     -- buyer could not resolve, against an embodiment they could not audit.
     FROM trajectory WHERE task_id = ? AND settled = 1 AND chain_id = ?
     ORDER BY created_at ASC`,
    [taskId, appChain.id],
  );

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
      dataset: `thenar-task-${taskId}`,
      embodiment: "THENAR-6",
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
      "content-disposition": `attachment; filename="thenar-task-${taskId}.json"`,
    },
  });
}
