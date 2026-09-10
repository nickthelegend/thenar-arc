import { NextResponse } from "next/server";
import { keccak256, toHex, isAddress } from "viem";
import { logged } from "@/lib/server/log";
import { insertPolicy, policyByHash, policyLeaderboard } from "@/lib/server/db";
import { evaluatePolicy, shapeError, STARTS, ARCH, type PolicyWeights } from "@/lib/rollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submit a policy, and be scored on the same starts as everybody else.
 *
 * This project's argument about trajectories is that a score you report about
 * your own work is worth nothing, and a score recomputed from the artefact is
 * worth something. The same is true of the models trained on them: a paper
 * reports its own numbers, on its own held-out set, and nobody can check
 * either. So the starts are fixed and published, the rollout runs here, and
 * what goes on the board is what this server measured rather than what the
 * submitter said.
 *
 * Nothing submitted is executed. A policy is three thousand numbers in a fixed
 * shape and evaluating one is arithmetic — that is a property of the
 * architecture, not of a sandbox, and it is the reason this can be open at all.
 *
 * Entries are keyed by the hash of the weights, so sending the same model
 * twice is the same entry. A model does not improve by being resubmitted.
 */

/** Enough for 3,076 float parameters with room to spare, small enough that a
 *  request cannot be used to post a corpus. */
const MAX_BYTES = 400_000;

async function handlePOST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `a policy must be under ${MAX_BYTES} bytes; this was ${raw.length}` },
      { status: 413 },
    );
  }

  let body: { weights?: unknown; submitter?: unknown; label?: unknown };
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "body must be JSON" }, { status: 400 }); }

  const submitter = typeof body.submitter === "string" ? body.submitter : "";
  if (!isAddress(submitter)) {
    return NextResponse.json({ error: "submitter must be an address" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.slice(0, 80).trim() : "";
  if (!label) {
    return NextResponse.json({ error: "label is required, so the board reads as something" }, { status: 400 });
  }

  const bad = shapeError(body.weights);
  if (bad) {
    return NextResponse.json(
      { error: bad, expected: ARCH, note: "The architecture is fixed: this station drives one shape of policy." },
      { status: 400 },
    );
  }
  const weights = body.weights as PolicyWeights;

  // The model's identity is its weights, canonically serialised. Two people
  // submitting the same file get one entry.
  const canonical = JSON.stringify([weights.mean, weights.std, weights.W1, weights.b1, weights.W2, weights.b2, weights.W3, weights.b3]);
  const weightsHash = keccak256(toHex(canonical));

  const already = await policyByHash(weightsHash);
  if (already) {
    return NextResponse.json({
      weightsHash, alreadySubmitted: true,
      result: { starts: already.starts, grasped: already.grasped, placed: already.placed, medianFinalMm: already.median_mm },
      note: "This exact model is already on the board, under its first submission.",
    });
  }

  const result = evaluatePolicy(weights);

  await insertPolicy({
    weights_hash: weightsHash,
    submitter: submitter.toLowerCase(),
    label,
    grasped: result.grasped,
    placed: result.placed,
    median_mm: Number(result.medianFinalMm.toFixed(3)),
    starts: result.starts,
    weights: canonical,
    created_at: Date.now(),
  });

  return NextResponse.json({ weightsHash, alreadySubmitted: false, result });
}

async function handleGET() {
  const rows = await policyLeaderboard();
  return NextResponse.json({
    starts: STARTS,
    architecture: ARCH,
    note:
      "Every entry was rolled out by this server on the starts above, in the " +
      "station's own dynamics. The weights are kept, so any entry can be re-run.",
    entries: rows.map((r) => ({
      weightsHash: r.weights_hash,
      label: r.label,
      submitter: r.submitter,
      starts: r.starts,
      grasped: r.grasped,
      placed: r.placed,
      medianFinalMm: r.median_mm,
      createdAt: r.created_at,
    })),
  });
}

export const POST = logged("/api/policy", handlePOST);
export const GET = logged("/api/policy", handleGET);
