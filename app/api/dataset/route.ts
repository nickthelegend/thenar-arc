import { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { corpusDownloadMessage, PROOF_WINDOW_SECONDS } from "@/lib/corpus-proof";
import { phasesOf } from "@/lib/phases";
import type { Sample } from "@/lib/types";
import { queryOne } from "@/lib/server/db";
import { taskCorpus } from "@/lib/server/corpus-export";
import { appChain, AXON_ADDRESS } from "@/lib/chain";
import { corpusLicence } from "@/lib/server/access";
import { AGENT_CORPUS, agentCorpusPrice } from "@/lib/agent-corpus";
import { armForTask } from "@/lib/server/task-arm";
import { embodimentOf } from "@/lib/embodiment";

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
    const arm = embodimentOf(await armForTask(row.task_id));

    const body = JSON.stringify({
      dataset: `thenar-run-${row.traj_hash.slice(0, 10)}`,
      embodiment: arm.name,
      arm: arm.kind,
      degrees_of_freedom: 6,
      joint_names: arm.joints,
      gripper: arm.gripper,
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

  // A whole task's corpus is what a licence buys: ThenarProtocol.licensed(policyId, holder),
  // on Arc or bought over CCIP. A single episode by hash stays open: that is the
  // sample a buyer looks at before deciding. Licence first, proof second: an
  // address with no licence is told so (402) before it is asked to sign; one
  // that has it has to show it is the one asking (401 until it does).
  const holder = req.headers.get("x-licensee") ?? req.headers.get("x-subscriber");
  const access = await corpusLicence(taskId, holder);
  if (access.gated && access.unreadable) {
    return NextResponse.json(
      { error: "The licence could not be read from Arc, so nothing was served. Try again in a moment." },
      { status: 503 },
    );
  }
  if (access.gated && !access.allowed) {
    return NextResponse.json(
      {
        error: access.policyId === null
          ? "This task has no policy minted, so there is no licence to hold. Buy the corpus per pull over x402."
          : access.who
            ? `That address holds no licence to policy #${access.policyId}.`
            : "Pulling a whole task's corpus needs a licence to its policy. Send the address as x-licensee.",
        protocol: AXON_ADDRESS,
        policyId: access.policyId,
        perPull: { endpoint: `${AGENT_CORPUS.path}?taskId=${taskId}`, price: agentCorpusPrice(), network: AGENT_CORPUS.network },
        single: "A single episode by hash is open: /api/dataset?traj=0x…",
      },
      { status: 402 },
    );
  }
  if (access.gated) {
    const proof = await subscriberProof(holder, taskId, req.headers);
    if (proof) return proof;
  }

  return taskCorpus(taskId);
}

/**
 * The caller has to be the licensee, not just name one. Returns the refusal
 * to send, or null when the signature is good. Without an address at all the
 * subscription check answers, so a bare request still learns what to send.
 */
async function subscriberProof(subscriber: string | null, taskId: number, h: Headers): Promise<NextResponse | null> {
  if (!subscriber || !/^0x[0-9a-fA-F]{40}$/.test(subscriber)) return null;
  const signature = h.get("x-subscriber-signature");
  const until = Number(h.get("x-subscriber-until"));
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature) || !Number.isInteger(until)) {
    return NextResponse.json(
      {
        error:
          "Prove the licence is yours: sign the download with that address and send the signature " +
          "as x-subscriber-signature, with x-subscriber-until.",
        message: corpusDownloadMessage(subscriber, taskId, Math.floor(Date.now() / 1000) + PROOF_WINDOW_SECONDS),
      },
      { status: 401 },
    );
  }
  const now = Math.floor(Date.now() / 1000);
  if (until < now) {
    return NextResponse.json({ error: "That signature has expired. Sign the download again." }, { status: 401 });
  }
  if (until > now + PROOF_WINDOW_SECONDS) {
    return NextResponse.json(
      { error: `A download signature is good for at most ${PROOF_WINDOW_SECONDS / 60} minutes. Sign it again with a nearer until.` },
      { status: 401 },
    );
  }
  const signer = await recoverMessageAddress({
    message: corpusDownloadMessage(subscriber, taskId, until),
    signature: signature as `0x${string}`,
  }).catch(() => null);
  if (!signer || signer.toLowerCase() !== subscriber.toLowerCase()) {
    return NextResponse.json({ error: "That signature is not from the licensed address." }, { status: 401 });
  }
  return null;
}
