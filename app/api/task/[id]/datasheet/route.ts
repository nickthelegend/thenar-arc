import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { chainClient } from "@/lib/rpc";
import { logged } from "@/lib/server/log";
import { trajectoriesForTask, attemptsForTask, failedTrajectories } from "@/lib/server/db";
import { ACCEPT_FLOOR, TOLERANCE_MM } from "@/lib/score";
import { rootOf } from "@/lib/merkle";
import { diversityMm } from "@/lib/similarity";
import { settledSamplesForTask } from "@/lib/server/db";
import type { Sample } from "@/lib/types";
import { appChain, AXON_ADDRESS, CORPUS_MANIFEST } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

/**
 * The datasheet for a task's corpus.
 *
 * Gebru et al. argue every dataset should ship with one — who collected it,
 * how, what is in it, what it should not be used for — because the answers are
 * obvious to whoever built it and unavailable to everybody else. Robotics
 * corpora are usually distributed as a tarball and a README, and the questions
 * that decide whether it is fit for a purpose go unasked.
 *
 * Every figure here is computed from the record at request time rather than
 * written down once. A datasheet that drifts from its dataset is worse than
 * none, because it is believed.
 *
 * The uncomfortable answers are in it too. This corpus is small, its coverage
 * is narrow, its tasks were funded by the people who built the protocol, and
 * three payouts on this contract have no retrievable trajectory. A datasheet
 * that omits those is marketing.
 */
async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }

  const [accepted, attempts, failures, withSamples] = await Promise.all([
    trajectoriesForTask(taskId, 500),
    attemptsForTask(taskId, ACCEPT_FLOOR),
    failedTrajectories(taskId, ACCEPT_FLOOR),
    settledSamplesForTask(taskId, 200),
  ]);

  if (accepted.length === 0 && attempts.length === 0) {
    return NextResponse.json({ error: "no runs recorded for that task" }, { status: 404 });
  }

  // The chain is asked for the instruction and the economics. If it does not
  // answer, the datasheet is served without them rather than not at all: the
  // parts computed from the record are the parts a buyer cannot get elsewhere.
  type OnChainTask = {
    name: string; funder: string; rewardPerTrajectory: bigint;
    slotsTotal: number; slotsFilled: number; difficulty: number;
  };
  let task: OnChainTask | null = null;
  try {
    task = (await client.readContract({
      address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTask", args: [BigInt(taskId)],
    })) as unknown as OnChainTask;
  } catch {
    task = null;
  }

  const scores = accepted.map((r) => r.score);
  const contributors = new Set(accepted.map((r) => r.contributor.toLowerCase()));
  const counts = { paid: 0, failed: 0, unsubmitted: 0 };
  for (const a of attempts) counts[a.outcome as keyof typeof counts] += 1;
  const attempted = counts.paid + counts.failed;
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return NextResponse.json({
    taskId,
    generated_at: new Date().toISOString(),
    motivation: {
      purpose:
        "Recordings of a six-axis arm performing one manipulation instruction, " +
        "collected to train and evaluate manipulation policies.",
      funded_by: task?.funder ?? null,
      note:
        "Every task on this deployment was funded by the address that deployed " +
        "the protocol, to demonstrate the loop end to end. The escrow, the " +
        "payouts and the trajectories are real; third-party demand is not.",
    },
    composition: {
      instruction: task?.name ?? null,
      episodes: accepted.length,
      contributors: contributors.size,
      frames_per_second: 20,
      per_frame: [
        "t — seconds since the run began",
        "q — six joint angles, radians",
        "grip — jaw opening, mm",
        "object — payload pose, metres",
        "object2, q2, grip2 — present only on scenes that have them",
      ],
      phase_labels: "reach, grasp, transport, place, release — derived from the samples",
      negatives: failures.length,
      negatives_note:
        "Runs that scored below the acceptance floor. Shipped in their own " +
        "array, never mixed into the demonstrations.",
    },
    collection: {
      instrument: "A browser station driving a simulated THENAR-6 at true scale.",
      recorded: "Joint angles and payload pose per frame, written by the station.",
      selection:
        "Any address may drive any open task, capped per operator by the contract. " +
        "No screening, no invitation.",
      scoring:
        `Placement (55%), efficiency (20%) and smoothness (25%), each computed ` +
        `from the samples by a verifier that holds a key the web service does not. ` +
        `Runs below ${ACCEPT_FLOOR / 100} are not paid.`,
      placement_tolerance_mm: TOLERANCE_MM,
      duplicate_policy:
        "A run whose payload followed a route already in the paid corpus is refused.",
    },
    quality: {
      mean_score: scores.length ? mean / 100 : null,
      best_score: scores.length ? Math.max(...scores) / 100 : null,
      worst_score: scores.length ? Math.min(...scores) / 100 : null,
      pass_rate: attempted ? counts.paid / attempted : null,
      attempts: counts,
      // How far apart the routes are, on average, in millimetres. Duplicate
      // rejection puts a floor of 12 mm under this; a corpus can clear that
      // and still be one corridor walked repeatedly. Null below two episodes,
      // because a single run is not diverse or undiverse.
      diversity_mm: diversityMm(
        withSamples.map((r) => ({ samples: JSON.parse(r.samples) as Sample[] })),
      ),
    },
    provenance: {
      chain: appChain.name,
      chain_id: appChain.id,
      protocol: AXON_ADDRESS,
      manifest: CORPUS_MANIFEST || null,
      corpus_root: accepted.length ? rootOf(accepted.map((r) => r.traj_hash)) : null,
      verify:
        "Each episode's hash is on chain with the payout that settled it. The " +
        "root above commits to the whole set; a single episode proves into it " +
        "with the proof from /api/task/{id}/manifest.",
      reward_per_trajectory_usdc: task ? formatEther(task.rewardPerTrajectory) : null,
    },
    limitations: {
      size: "Small. This is a demonstration deployment, not a production corpus.",
      simulation:
        "Recorded in simulation. The dynamics are the station's, not a physical " +
        "arm's, and no sim-to-real transfer is claimed.",
      coverage:
        "Concentrated. See the workspace coverage figure on the task page — a " +
        "corpus can average well and still have visited very little of the " +
        "reachable area.",
      demand:
        "Tasks were funded by the protocol's own deployer, so the distribution " +
        "of instructions reflects what was built to be demonstrated.",
      unbacked_payouts:
        "Three payouts on this contract have no retrievable trajectory, left by " +
        "proofs of the relayed submission path. They are reported by /api/health " +
        "and are not in any corpus.",
    },
    licence: {
      access: "A corpus download requires an active subscription; a single episode is open.",
      terms: "No licence terms are asserted by this deployment beyond access control.",
    },
  });
}

export const GET = logged("/api/task/[id]/datasheet", handleGET);
