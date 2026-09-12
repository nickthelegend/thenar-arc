import { NextResponse } from "next/server";
import { phasesOf } from "@/lib/phases";
import type { Sample } from "@/lib/types";
import { queryOne } from "@/lib/server/db";
import { taskCorpus } from "@/lib/server/corpus-export";
import { appChain, AXON_ADDRESS, CORPUS_ACCESS } from "@/lib/chain";
import { corpusAccess } from "@/lib/server/access";

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
        WHERE traj_hash = ? AND settled = 1 AND chain_id = ? AND contract = ?`,
      [one, appChain.id, AXON_ADDRESS.toLowerCase()],
    );

    if (!row) {
      return NextResponse.json({ error: "No settled trajectory with that hash on this chain." }, { status: 404 });
    }

    const samples = JSON.parse(row.samples) as Sample[];

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
        // Reach, grasp, transport, place, release, as frame ranges. Derived
        // from the jaw column and the payload's height, so a buyer can rederive
        // them from the arrays above rather than take them on trust.
        phases: phasesOf(samples),
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

  // Whole-corpus pulls are what a subscription is for. A single episode by
  // hash stays open: that is the sample a buyer looks at before deciding, and
  // charging for the look is how you end up with nobody looking.
  const access = await corpusAccess(req.headers.get("x-subscriber"));
  if (access.gated && !access.allowed) {
    return NextResponse.json(
      {
        error: access.who
          ? "That address has no active corpus subscription."
          : "Pulling a whole task's corpus needs an active subscription. Send the address as x-subscriber.",
        contract: CORPUS_ACCESS,
        single: "A single episode by hash is open: /api/dataset?traj=0x…",
      },
      { status: 402 },
    );
  }

  return taskCorpus(taskId);
}
