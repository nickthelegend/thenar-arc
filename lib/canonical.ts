import type { Sample } from "@/lib/types";

/**
 * The exact bytes a trajectory hashes to.
 *
 * Shared rather than server-only on purpose: the whole claim is that anyone can
 * check what a payout was for, and a check you can only run on our server is
 * not a check. The browser re-derives the hash from the samples it was handed
 * and compares it to the one the contract recorded — if this lived behind the
 * API, verification would mean trusting the thing being verified.
 *
 * Fixed decimal places, because a float that serialises differently on two
 * machines is a hash that disagrees with itself.
 */
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
