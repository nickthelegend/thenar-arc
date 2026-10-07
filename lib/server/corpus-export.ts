import "server-only";
import { NextResponse } from "next/server";
import { phasesOf } from "@/lib/phases";
import { ACCEPT_FLOOR } from "@/lib/score";
import { classifyFailure } from "@/lib/failure";
import { splitFor } from "@/lib/split";
import { failedTrajectories, annotationsForTask, query } from "@/lib/server/db";
import type { Sample } from "@/lib/types";
import { appChain, AXON_ADDRESS } from "@/lib/chain";
import { armForTask } from "@/lib/server/task-arm";
import { embodimentOf } from "@/lib/embodiment";

/**
 * One task's corpus, as a training set.
 *
 * Lifted out of /api/dataset when a second way of paying for it arrived. A
 * CorpusAccess subscription and a per-pull x402 payment in USDC on Monad buy
 * the same thing, so they hand over the same file from the same function
 * rather than two exports that drift apart the first time one of them changes.
 */
export async function taskCorpus(taskId: number): Promise<NextResponse> {
  const rows = await query<{
    traj_hash: string; contributor: string; score: number; deviation_mm: number;
    duration_s: number; samples: string; tx_hash: string | null; created_at: number;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s, samples, tx_hash, created_at
     -- Scoped to the chain this deployment settles on. A corpus that mixed
     -- in runs paid on a previous chain would carry transaction hashes a
     -- buyer could not resolve, against an embodiment they could not audit.
     FROM trajectory WHERE task_id = ? AND settled = 1 AND chain_id = ? AND contract = ?
     ORDER BY created_at ASC`,
    [taskId, appChain.id, AXON_ADDRESS.toLowerCase()],
  );

  /**
   * The runs that did not work, fetched before deciding whether there is a
   * corpus at all.
   *
   * This used to bail out on "no settled runs" with "No trajectories recorded
   * for that task", which was false twice over on a task people had attempted
   * and failed: trajectories were recorded, and the negatives this project
   * makes a point of keeping were unreachable for exactly the tasks made
   * entirely of them.
   */
  const failureRows = await failedTrajectories(taskId, ACCEPT_FLOOR);

  if (rows.length === 0 && failureRows.length === 0) {
    return NextResponse.json({ error: "Nothing recorded for that task." }, { status: 404 });
  }

  // What operators said about their own runs, joined on the hash. Absent for
  // most episodes: an annotation is written by hand and most are not.
  //
  // Declared before the map that reads it, and that ordering is load-bearing:
  // a const referenced from a callback that runs immediately is still in its
  // temporal dead zone, which the type checker allows because the reference is
  // inside a closure and the runtime does not because the closure runs now.
  const notes = new Map((await annotationsForTask(taskId)).map((a) => [a.traj_hash, a.body]));

  const episodes = rows.map((r, i) => {
    const samples = JSON.parse(r.samples) as Sample[];
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
      phases: phasesOf(samples),
      // What the operator said about this run, in their own words. Null when
      // nobody wrote one — most episodes have none, and an invented sentence
      // would be worse than the absence.
      annotation: notes.get(r.traj_hash) ?? null,
      // Held out by operator, not by episode: episodes from one address share a
      // style, and cutting at random puts that style in train and in test.
      split: splitFor(r.contributor),
    };
  });

  /**
   * The runs that did not work.
   *
   * Kept in their own array and never mixed into `data`, because a buyer who
   * concatenates the file must not silently train on failures as though they
   * were demonstrations. They are here because negative examples are the
   * scarcest thing in manipulation data and this corpus has been discarding
   * them from view since it started — scored, stored, and shown to nobody.
   *
   * Nothing here was paid for and nothing here is on chain. That is the whole
   * distinction, and it is stated per episode as well as here.
   */
  const failures = failureRows.map((r, i) => {
    const samples = JSON.parse(r.samples) as Sample[];
    return {
      episode_index: i,
      trajectory_hash: r.traj_hash,
      contributor: r.contributor,
      outcome: "failed" as const,
      paid: false,
      on_chain: false,
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
      phases: phasesOf(samples),
      // What went wrong, read from the same samples. A negative example is
      // only trainable if you know what it is an example of: "scored 6.6" says
      // a run was bad, "the jaws never closed" says what happened.
      failure: classifyFailure(samples),
    };
  });

  const arm = embodimentOf(await armForTask(taskId));
  const body = JSON.stringify(
    {
      dataset: `thenar-task-${taskId}`,
      embodiment: arm.name,
      arm: arm.kind,
      degrees_of_freedom: 6,
      joint_names: arm.joints,
      gripper: arm.gripper,
      control_frequency_hz: 20,
      episodes: episodes.length,
      total_frames: episodes.reduce((n, e) => n + e.length, 0),
      exported_at: new Date().toISOString(),
      schema_version: 3,
      splits: {
        held_out_by: "contributor",
        why:
          "Episodes from one operator share an approach. Splitting by episode " +
          "puts the same person in train and in test, and the test score then " +
          "measures memorising a person rather than learning the task.",
        counts: episodes.reduce((acc: Record<string, number>, e) => {
          acc[e.split] = (acc[e.split] ?? 0) + 1;
          return acc;
        }, {}),
      },
      data: episodes,
      negatives: failures,
      negatives_note:
        "Runs that scored below the acceptance floor. Real recordings, unpaid " +
        "and not on chain. Kept separate so they are never trained on as " +
        "demonstrations by accident." +
        (episodes.length === 0
          ? " This task has no paid episodes at all: everything recorded on it " +
            "so far is in this array, and `data` is empty rather than missing."
          : ""),
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
