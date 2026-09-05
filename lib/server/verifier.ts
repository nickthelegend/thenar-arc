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
export function canonicalise(taskId: number, contributor: string, samples: Sample[]): string {
  return JSON.stringify({
    v: 1,
    taskId,
    contributor: contributor.toLowerCase(),
    samples: samples.map((s) => [
      Number(s.t.toFixed(3)),
      s.q.map((q) => Number(q.toFixed(5))),
      Number(s.grip.toFixed(2)),
      s.object.map((o) => Number(o.toFixed(5))),
    ]),
  });
}

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
      s.object.every((n: unknown) => typeof n === "number" && Number.isFinite(n));
    if (!ok) throw new VerifyError(`sample ${i} is malformed`);
    if (s.t < lastT) throw new VerifyError(`sample ${i} goes backwards in time`);
    lastT = s.t;
    return s as Sample;
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
};

/**
 * Re-score the run on the server and sign the result.
 *
 * The client's own score is never trusted and never read — the trajectory is
 * evaluated here with the same deterministic function, and only this signature
 * makes a payout possible on chain.
 */
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

  const payload = canonicalise(args.taskId, args.contributor, args.samples);
  const trajHash = keccak256(toHex(payload));
  const cid = `axon:${trajHash.slice(2, 18)}`;

  const account = privateKeyToAccount(pk as `0x${string}`);
  const signature = await account.signTypedData({
    domain: {
      name: "Thenar",
      version: "1",
      chainId: args.chainId,
      verifyingContract: args.contractAddress,
    },
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
  };
}
