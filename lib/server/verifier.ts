import { canonicalise } from "@/lib/canonical";
import "server-only";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Sample, Trajectory } from "@/lib/types";
import { evaluate } from "@/lib/score";

export const MAX_SAMPLES = 12_000; // 20 Hz for ten minutes
export const MIN_SAMPLES = 20;

export class VerifyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Canonical serialisation. The hash has to be reproducible from the stored rows. */

export function validateSamples(raw: unknown): Sample[] {
  if (!Array.isArray(raw)) throw new VerifyError("samples must be an array");
  if (raw.length < MIN_SAMPLES) throw new VerifyError("run too short to score");
  if (raw.length > MAX_SAMPLES) throw new VerifyError("run exceeds the sample cap", 413);

  let lastT = -Infinity;
  return raw.map((s, i) => {
    const ok =
      s && typeof s.t === "number" && Number.isFinite(s.t) &&
      Array.isArray(s.q) && s.q.length === 6 && s.q.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) &&
      typeof s.grip === "number" && Number.isFinite(s.grip) &&
      Array.isArray(s.object) && s.object.length === 3 &&
      s.object.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) &&
      (s.object2 === undefined ||
        (Array.isArray(s.object2) && s.object2.length === 3 &&
         s.object2.every((n: unknown) => typeof n === "number" && Number.isFinite(n)))) &&
      (s.q2 === undefined ||
        (Array.isArray(s.q2) && s.q2.length === 6 &&
         s.q2.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) &&
         typeof s.grip2 === "number" && Number.isFinite(s.grip2)));
    if (!ok) throw new VerifyError(`sample ${i} is malformed`);
    if (s.t < lastT) throw new VerifyError(`sample ${i} goes backwards in time`);
    lastT = s.t;
    return s as Sample;
  }).map((s, i, all) => {
    // A scene does not gain or lose a payload mid-run. Allowing it would let a
    // client hash as version 2 while driving a version 1 scene, and the second
    // object's whole placement would be unmeasurable on the samples that omit it.
    if (Boolean(s.object2) !== Boolean(all[0].object2)) {
      throw new VerifyError(`sample ${i} disagrees with the scene's payload count`);
    }
    // Nor does it gain or lose an arm. A recording whose second arm appears
    // halfway through is a recording of two different rooms.
    if (Boolean(s.q2) !== Boolean(all[0].q2)) {
      throw new VerifyError(`sample ${i} disagrees with the scene's arm count`);
    }
    return s;
  });
}

/** The prop ids a run was driven against. Free text from the client, so it is
 *  bounded here rather than trusted: they become part of the hashed trajectory
 *  and are rendered back on the run page. */
export function validatePayloadIds(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) throw new VerifyError("payloadIds must be a non-empty array");
  if (raw.length > 2) throw new VerifyError("a scene carries at most two payloads");
  return raw.map((id) => {
    if (typeof id !== "string" || !/^[a-z0-9_]{1,32}$/.test(id)) {
      throw new VerifyError("payloadIds must be prop ids");
    }
    return id;
  });
}

export type VerifyResult = {
  trajHash: `0x${string}`;
  cid: string;
  score: number;
  payoutBps: number;
  parts: { placement: number; efficiency: number; smoothness: number };
  signature: `0x${string}`;
  accepted: boolean;
  /** Measured from the samples, not the figure the caller sent. This is what
   *  the ledger records, so a run page shows the distance the recording
   *  actually ends at rather than the one it was described with. */
  deviationMm: number;
};

/**
 * Re-score the run on the server and sign the result.
 *
 * The client's own score is never trusted and never read — the trajectory is
 * evaluated here with the same deterministic function, and only this signature
 * makes a payout possible on chain.
 */
/**
 * The EIP-712 domain the contract verifies against.
 *
 * `name` is NOT the product name. The deployed contract hardcodes
 * keccak256("Axon"), so this has to match byte for byte or every signature is
 * rejected with BadSignature(). It does not get renamed with the brand —
 * changing it means redeploying the contract. /api/health asserts this against
 * the chain on every call so a rename can never silently break submissions.
 */
export function runDomain(chainId: number, verifyingContract: `0x${string}`) {
  return { name: "Axon", version: "1", chainId, verifyingContract } as const;
}

export async function verifyAndSign(args: {
  taskId: number;
  contributor: `0x${string}`;
  samples: Sample[];
  durationSeconds: number;
  deviationMm: number;
  success: boolean;
  parSeconds: number;
  rewardWei: bigint;
  contractAddress: `0x${string}`;
  chainId: number;
  payloadIds?: string[];
}): Promise<VerifyResult> {
  const pk = process.env.VERIFIER_PRIVATE_KEY;
  if (!pk) throw new VerifyError("verifier key is not configured", 500);

  const traj: Trajectory = {
    taskId: String(args.taskId),
    samples: args.samples,
    durationSeconds: args.durationSeconds,
    success: args.success,
    deviationMm: args.deviationMm,
  };

  // rewardPerTrajectory is passed as 1 so `payoutMon` comes back as a fraction;
  // the contract does the real multiplication against its own escrowed rate.
  const verdict = evaluate(traj, args.parSeconds, 1);

  const payload = canonicalise(args.taskId, args.contributor, args.samples, args.payloadIds);
  const trajHash = keccak256(toHex(payload));
  const cid = `axon:${trajHash.slice(2, 18)}`;

  const account = privateKeyToAccount(pk as `0x${string}`);
  const signature = await account.signTypedData({
    domain: runDomain(args.chainId, args.contractAddress),
    types: {
      Run: [
        { name: "taskId", type: "uint256" },
        { name: "contributor", type: "address" },
        { name: "trajHash", type: "bytes32" },
        { name: "cid", type: "string" },
        { name: "score", type: "uint16" },
      ],
    },
    primaryType: "Run",
    message: {
      taskId: BigInt(args.taskId),
      contributor: args.contributor,
      trajHash,
      cid,
      score: verdict.score,
    },
  });

  return {
    trajHash,
    cid,
    score: verdict.score,
    payoutBps: verdict.score,
    parts: verdict.parts,
    signature,
    accepted: verdict.success,
    deviationMm: verdict.deviationMm,
  };
}

export { canonicalise };
