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
export function canonicalise(
  taskId: number,
  contributor: string,
  samples: Sample[],
  /** The props the run was driven against, in the order they were placed.
   *  Only present on scenes the instruction did not fully determine — a second
   *  payload, or an object drawn from the scenario's pool. */
  payloadIds?: string[],
): string {
  const rows = samples.map((s) => {
    const row: unknown[] = [
      Number(s.t.toFixed(3)),
      s.q.map((q) => Number(q.toFixed(5))),
      Number(s.grip.toFixed(2)),
      s.object.map((o) => Number(o.toFixed(5))),
    ];
    if (s.object2) row.push(s.object2.map((o) => Number(o.toFixed(5))));
    if (s.q2) {
      row.push(s.q2.map((q) => Number(q.toFixed(5))));
      row.push(Number((s.grip2 ?? 0).toFixed(2)));
    }
    return row;
  });

  // Neither earlier version is a legacy branch to be tidied away: each is the
  // exact byte sequence some settled payout was derived from, and any change
  // to one makes those hashes stop matching the chain. A run that needs
  // nothing a later version adds must still serialise as the earlier one,
  // character for character.
  const needsV3 = samples.some((s) => s.q2);
  const needsV2 = needsV3 || (payloadIds?.length ?? 0) > 0 || samples.some((s) => s.object2);

  if (!needsV2) {
    return JSON.stringify({ v: 1, taskId, contributor: contributor.toLowerCase(), samples: rows });
  }

  return JSON.stringify({
    v: needsV3 ? 3 : 2,
    taskId,
    contributor: contributor.toLowerCase(),
    // In the scene, the object the trajectory was actually recorded against is
    // part of what the payout is for. A corpus whose episodes cannot say which
    // object they hold is not a corpus anyone can train on.
    payloads: payloadIds ?? [],
    samples: rows,
  });
}
