import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, monadTestnet } from "@/lib/chain";
import { insertTrajectory, getTrajectory } from "@/lib/server/db";
import { validateSamples, verifyAndSign, VerifyError } from "@/lib/server/verifier";
import { parSecondsFor } from "@/lib/par";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: monadTestnet, transport: http() });

/** Crude per-address throttle: a run takes tens of seconds, so this is generous. */
const lastSeen = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function throttled(who: string) {
  const now = Date.now();
  const hits = (lastSeen.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  lastSeen.set(who, hits);
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  try {
    if (!IS_DEPLOYED) {
      return NextResponse.json(
        { error: "No contract address configured. Deploy first, then set NEXT_PUBLIC_AXON_ADDRESS." },
        { status: 503 },
      );
    }

    const body = await req.json();
    const { taskId, contributor, durationSeconds, deviationMm, success } = body ?? {};

    if (typeof taskId !== "number" || taskId < 0) throw new VerifyError("taskId is required");
    if (typeof contributor !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(contributor)) {
      throw new VerifyError("contributor must be an address");
    }
    if (typeof durationSeconds !== "number" || !(durationSeconds > 0)) {
      throw new VerifyError("durationSeconds is required");
    }
    if (typeof deviationMm !== "number" || !Number.isFinite(deviationMm)) {
      throw new VerifyError("deviationMm is required");
    }
    if (throttled(contributor.toLowerCase())) {
      return NextResponse.json({ error: "Too many submissions. Wait a moment." }, { status: 429 });
    }

    const samples = validateSamples(body.samples);

    // The task has to exist on chain, and its difficulty sets the par time the
    // efficiency term is scored against.
    const task = (await client.readContract({
      address: AXON_ADDRESS,
      abi: AXON_ABI,
      functionName: "getTask",
      args: [BigInt(taskId)],
    })) as { difficulty: number; rewardPerTrajectory: bigint; slotsFilled: number; slotsTotal: number };

    if (task.slotsFilled >= task.slotsTotal) {
      return NextResponse.json({ error: "This task has no slots left." }, { status: 409 });
    }

    const result = await verifyAndSign({
      taskId,
      contributor: contributor as `0x${string}`,
      samples,
      durationSeconds,
      deviationMm,
      success: Boolean(success),
      parSeconds: parSecondsFor(task.difficulty),
      rewardWei: task.rewardPerTrajectory,
      contractAddress: AXON_ADDRESS,
      chainId: monadTestnet.id,
    });

    // A hash already on file was already scored; hand back the same signature
    // rather than issuing a second one for identical data.
    const existing = getTrajectory(result.trajHash);
    if (!existing) {
      insertTrajectory({
        traj_hash: result.trajHash,
        task_id: taskId,
        contributor: contributor.toLowerCase(),
        score: result.score,
        deviation_mm: deviationMm,
        duration_s: durationSeconds,
        placement: result.parts.placement,
        efficiency: result.parts.efficiency,
        smoothness: result.parts.smoothness,
        sample_count: samples.length,
        samples: JSON.stringify(samples),
        signature: result.signature,
        created_at: Date.now(),
      });
    }

    return NextResponse.json({
      trajHash: result.trajHash,
      cid: result.cid,
      score: result.score,
      accepted: result.accepted,
      parts: result.parts,
      signature: existing ? (existing.signature as `0x${string}`) : result.signature,
      parSeconds: parSecondsFor(task.difficulty),
      rewardWei: task.rewardPerTrajectory.toString(),
    });
  } catch (e) {
    if (e instanceof VerifyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
