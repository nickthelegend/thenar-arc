import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { IS_DEPLOYED } from "@/lib/chain";
import { insertTrajectory, getTrajectory, settledSamplesForTask } from "@/lib/server/db";
import { nearestNeighbour, DUPLICATE_MM } from "@/lib/similarity";
import { validateSamples, validatePayloadIds, VerifyError } from "@/lib/server/verifier";
import { POST as signLocally } from "@/app/api/sign/route";
import type { Sample } from "@/lib/types";
import { canonicalise } from "@/lib/canonical";
import { keccak256, toHex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * Where the verifier key lives.
 *
 * Set in production to the signer service's private address, which has no
 * public domain and cannot be reached from outside the project. Unset in local
 * development, where there is only one process and it signs for itself — so
 * this is not a switch that can leave production quietly signing in the wrong
 * place: production's web service does not have the key at all, and a
 * misconfigured SIGNER_ORIGIN fails loudly rather than falling back.
 */
const SIGNER_ORIGIN = process.env.SIGNER_ORIGIN;

type Signed = {
  trajHash: `0x${string}`; cid: string; score: number; accepted: boolean;
  parts: { placement: number; efficiency: number; smoothness: number };
  signature: `0x${string}`; parSeconds: number; rewardWei: string;
  /** The deviation the signer measured from the samples. The request carries a
   *  deviation too and it is not this one — that is the claim, and it is not
   *  what gets scored or stored. */
  deviationMm: number;
};

async function sign(args: {
  taskId: number; contributor: string; samples: Sample[];
  durationSeconds: number; deviationMm: number; success: boolean;
  payloadIds?: string[];
}): Promise<Signed | { error: string; status: number }> {
  const target = SIGNER_ORIGIN ?? "";
  const url = `${target}/api/sign`;

  // Local development, one process: call the route's own handler rather than
  // making an HTTP request to ourselves, which a single-worker dev server
  // would deadlock on.
  const res = target
    ? await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      })
    : await signLocally(new Request("http://local/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      }));

  const body = await res.json();
  if (!res.ok) return { error: body.error ?? "the verifier refused this run", status: res.status };
  return body as Signed;
}

async function handlePOST(req: Request) {
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
    const payloadIds = validatePayloadIds(body.payloadIds);

    // The scene the client says it drove has to match the recording it sends:
    // two payload ids and one object column is a claim about an object that
    // was never recorded moving.
    if ((payloadIds?.length ?? 1) > 1 !== Boolean(samples[0].object2)) {
      throw new VerifyError("payloadIds do not match the recorded scene");
    }

    /**
     * The same route, submitted twice.
     *
     * The contract already refuses an identical trajectory hash, which catches
     * a copy-paste and nothing else: move one sample by a micrometre and it is
     * a new hash, a new signature and a second payout for a recording that
     * adds nothing. What a funder is buying is variety, and six copies of one
     * route is a worse dataset than one copy — it also overstates how much
     * evidence there is.
     *
     * Checked before signing rather than after, so a refused run never gets a
     * signature it could submit anyway.
     */
    // The run's own hash, derived here by the same canonicalisation the signer
    // uses. Only needed to keep a run from being called a duplicate of itself:
    // an operator whose client re-verifies a recording already on file must get
    // its signature back, not a refusal.
    const ownHash = keccak256(
      toHex(canonicalise(taskId, contributor as `0x${string}`, samples, payloadIds)),
    ).toLowerCase();

    const priorRuns = await settledSamplesForTask(taskId);
    const near = nearestNeighbour(
      samples,
      priorRuns
        .filter((r) => r.traj_hash.toLowerCase() !== ownHash)
        .map((r) => ({ hash: r.traj_hash, samples: JSON.parse(r.samples) as Sample[] })),
    );
    if (near && near.distanceMm < DUPLICATE_MM) {
      return NextResponse.json(
        {
          error:
            `This run follows a route already recorded on this task, ` +
            `${near.distanceMm.toFixed(1)} mm from it on average. Drive it differently — ` +
            `a task pays for six ways of doing it, not six copies of one.`,
          duplicateOf: near.hash,
          distanceMm: Number(near.distanceMm.toFixed(2)),
        },
        { status: 409 },
      );
    }

    // Signing happens in the signer service, which holds the key this one
    // does not. It reads the task from the chain itself and scores the samples
    // itself, so what crosses the private network is a recording, not a score
    // this process could have chosen.
    const result = await sign({
      taskId, contributor, samples, durationSeconds, deviationMm,
      success: Boolean(success), payloadIds,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // A hash already on file was already scored; hand back the same signature
    // rather than issuing a second one for identical data.
    const existing = await getTrajectory(result.trajHash);
    if (!existing) {
      await insertTrajectory({
        traj_hash: result.trajHash,
        task_id: taskId,
        contributor: contributor.toLowerCase(),
        score: result.score,
        // The verifier's measurement, not the request's claim.
        deviation_mm: result.deviationMm,
        duration_s: durationSeconds,
        placement: result.parts.placement,
        efficiency: result.parts.efficiency,
        smoothness: result.parts.smoothness,
        sample_count: samples.length,
        samples: JSON.stringify(samples),
        signature: result.signature,
        created_at: Date.now(),
        payload_ids: payloadIds ? JSON.stringify(payloadIds) : null,
      });
    }

    return NextResponse.json({
      trajHash: result.trajHash,
      cid: result.cid,
      score: result.score,
      accepted: result.accepted,
      parts: result.parts,
      signature: existing ? (existing.signature as `0x${string}`) : result.signature,
      parSeconds: result.parSeconds,
      rewardWei: result.rewardWei,
      // What the verifier measured, which is not necessarily what the caller
      // sent. Returned so a client can see the figure its score was actually
      // computed from rather than assume its own was used.
      deviationMm: result.deviationMm,
    });
  } catch (e) {
    if (e instanceof VerifyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = logged("/api/verify", handlePOST);
