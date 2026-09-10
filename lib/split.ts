import { keccak256, toHex } from "viem";

/**
 * Which split an episode belongs to.
 *
 * A corpus without a published split is a corpus every buyer splits
 * differently, which makes two papers' numbers on the same data
 * incomparable — and a corpus split carelessly is worse, because the usual
 * mistake is invisible. Episodes from one operator share a style: the same
 * approach angle, the same hesitation before the grasp, the same overshoot. Cut
 * them at random and that operator appears in train and in test, and the test
 * score measures memorisation of a person rather than of a task.
 *
 * So the cut is by contributor. Every episode an address recorded lands in the
 * same split, and a policy is tested on operators it has never seen.
 *
 * Deterministic, from the address alone: two servers, or the same server after
 * a restart, produce the same assignment, and the split can be recomputed by
 * whoever downloaded the file rather than trusted.
 */

export type Split = "train" | "val" | "test";

/** Roughly 70 / 15 / 15, by operator rather than by episode. */
export function splitFor(contributor: string): Split {
  // The low two bytes of the address hash: a uniform value in 0..65535 that
  // depends on nothing but the address.
  const h = keccak256(toHex(contributor.toLowerCase()));
  const n = parseInt(h.slice(-4), 16) / 0x10000;
  if (n < 0.7) return "train";
  if (n < 0.85) return "val";
  return "test";
}
