import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";

import { chainClient } from "@/lib/rpc";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { validateSamples, validatePayloadIds, verifyAndSign, VerifyError } from "@/lib/server/verifier";
import { parSecondsFor } from "@/lib/par";
import { canonicalise } from "@/lib/canonical";
import { keccak256, toHex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

/**
 * The only place the verifier key is used.
 *
 * This runs as its own Railway service with no public domain, reachable only
 * from inside the project's private network. The service that serves the site
 * does not have the key at all, so an exploit that reaches the web container —
 * a bad dependency, a traversal, an SSRF — reaches a container that has
 * nothing to sign with.
 *
 * Isolation is only worth having if this is more than a signing oracle. A
 * process that signs whatever score it is handed gives an attacker who can
 * reach it exactly what the key gave them. So the task is read from the chain
 * here rather than accepted from the caller, par is derived from the task's own
 * difficulty, and the score is computed from the samples by this process. The
 * caller supplies a recording; it does not supply a number.
 *
 * Nothing is stored here. The corpus lives with the service that owns the
 * volume, which is the one thing this deliberately cannot reach.
 */
async function handlePOST(req: Request) {
  try {
    if (!process.env.VERIFIER_PRIVATE_KEY) {
      // Not a misconfiguration to paper over: on the web service this route is
      // meant to be dead, and answering it with anything but a refusal would
      // mean the key had ended up back where it was moved out of.
      return NextResponse.json({ error: "this service does not hold the verifier key" }, { status: 503 });
    }
    if (!IS_DEPLOYED) {
      return NextResponse.json({ error: "no contract address configured" }, { status: 503 });
    }

    // A body that is not JSON is the caller's mistake, not the verifier's: it
    // answered 500 "could not score this run" before.
    const body = await req.json().catch(() => {
      throw new VerifyError("body must be JSON");
    });
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

    const samples = validateSamples(body.samples);
    const payloadIds = validatePayloadIds(body.payloadIds);
    if ((payloadIds?.length ?? 1) > 1 !== Boolean(samples[0].object2)) {
      throw new VerifyError("payloadIds do not match the recorded scene");
    }

    // Read from the chain, not from the caller. par comes from the task's own
    // difficulty, so the efficiency term cannot be set by whoever calls this.
    const task = (await client.readContract({
      address: AXON_ADDRESS,
      abi: AXON_ABI,
      functionName: "getTask",
      args: [BigInt(taskId)],
    })) as { difficulty: number; rewardPerTrajectory: bigint; slotsFilled: number; slotsTotal: number };

    if (task.slotsFilled >= task.slotsTotal) {
      return NextResponse.json({ error: "This task has no slots left." }, { status: 409 });
    }

    const parSeconds = parSecondsFor(task.difficulty);
    const result = await verifyAndSign({
      taskId,
      contributor: contributor as `0x${string}`,
      samples,
      durationSeconds,
      deviationMm,
      success: Boolean(success),
      parSeconds,
      rewardWei: task.rewardPerTrajectory,
      contractAddress: AXON_ADDRESS,
      chainId: appChain.id,
      payloadIds,
    });

    return NextResponse.json({
      ...result,
      parSeconds,
      rewardWei: task.rewardPerTrajectory.toString(),
      sampleCount: samples.length,
    });
  } catch (e) {
    if (e instanceof VerifyError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[/api/sign]", e);
    return NextResponse.json({ error: "The verifier could not score this run." }, { status: 500 });
  }
}

export const POST = logged("/api/sign", handlePOST);

/**
 * Readiness, without signing anything.
 *
 * The address is derivable from the key and is already public — it is written
 * into the contract — so reporting it proves this process holds the right key
 * without revealing it. /api/health on the web service asks this, which is how
 * a key that had silently gone missing would be caught before an operator
 * found out by having a run refused.
 */
export async function GET() {
  const pk = process.env.VERIFIER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ holdsKey: false }, { status: 503 });
  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    return NextResponse.json({
      holdsKey: true,
      verifier: privateKeyToAccount(pk as `0x${string}`).address,
      // Which serialisation this process would hash a run with.
      //
      // Moving the key into its own service moved the hashing with it, and two
      // services can be deployed apart. When they were, this one hashed a
      // two-arm run by the older rules while the service that reads runs back
      // re-derived them by the newer ones, and every run submitted in that
      // window was stored disagreeing with its own hash. Nothing failed
      // loudly: the signature was valid, the transaction succeeded, and only
      // the integrity badge on a page nobody had opened yet said otherwise.
      //
      // So the shape is published, and /api/health compares it against its
      // own. A drift now shows up as a failed check rather than as a corpus.
      canonical: canonicalShape(),
    });
  } catch {
    return NextResponse.json({ holdsKey: false, error: "the key is not a valid private key" }, { status: 500 });
  }
}

/** A fixed sample run through this build's canonicaliser. Two services that
 *  agree on this agree on every hash they will ever produce. */
export function canonicalShape(): string {
  const probe = [{
    t: 0, q: [0, 0, 0, 0, 0, 0], grip: 42,
    object: [0, 0, 0], object2: [0, 0, 0],
    q2: [0, 0, 0, 0, 0, 0], grip2: 42,
  }] as unknown as Parameters<typeof canonicalise>[2];
  return keccak256(toHex(canonicalise(0, "0x0000000000000000000000000000000000000000", probe, ["a"])));
}
