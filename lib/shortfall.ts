import type { Verdict } from "@/lib/types";
import {
  ACCEPT_FLOOR, TOLERANCE_MM, JERK_CEIL, JERK_FLOOR,
  W_PLACEMENT, W_EFFICIENCY, W_SMOOTHNESS, ORDER_PENALTY,
} from "@/lib/score";

/**
 * What the run lost, and where.
 *
 * A score is a single number and an operator cannot act on it. Every term is
 * already computed with the weight it carries, so the loss can be attributed
 * exactly: how many points each part gave up against a perfect run, what that
 * cost in AVAX at this task's rate, and the one sentence that says what to do
 * differently. Nothing here is estimated — it is the same arithmetic the
 * contract was asked to pay against, read backwards.
 */

export type Shortfall = {
  key: "placement" | "smoothness" | "efficiency" | "regrasp" | "order";
  label: string;
  /** Score points lost, 0..10000, weighted as the total is. */
  lost: number;
  /** What those points were worth on this task. */
  costMon: number;
  /** The measurement behind it, as the operator saw it. */
  reading: string;
  /** What would have to change. */
  advice: string;
};

const TERMS = [
  { key: "placement", label: "Placement", weight: W_PLACEMENT },
  { key: "smoothness", label: "Smoothness", weight: W_SMOOTHNESS },
  { key: "efficiency", label: "Efficiency", weight: W_EFFICIENCY },
] as const;

export function shortfalls(v: Verdict, rewardPerTrajectory: number): Shortfall[] {
  const out: Shortfall[] = TERMS.map(({ key, label, weight }) => {
    const got = v.parts[key];
    const lost = Math.round((1 - got) * weight * 10000);
    const costMon = (rewardPerTrajectory * lost) / 10000;

    const reading =
      key === "placement"
        ? `${Math.abs(v.deviationMm).toFixed(1)} mm from the datum, tolerance ±${TOLERANCE_MM} mm`
        : key === "smoothness"
          ? `mean jerk ${v.raw.meanJerk.toFixed(1)}, full marks at ${JERK_FLOOR} and none at ${JERK_CEIL}`
          : `${v.raw.seconds.toFixed(1)}s against a par of ${v.raw.parSeconds.toFixed(1)}s`;

    const advice =
      key === "placement"
        ? Math.abs(v.deviationMm) > TOLERANCE_MM
          ? "The payload came to rest outside the band, so every term scored zero. Land it inside the circle."
          : "Let go closer to the centre of the datum circle."
        : key === "smoothness"
          ? v.raw.meanJerk > JERK_CEIL
            ? "The path changed direction hard and often. Move in longer, straighter passes."
            : "Fewer corrections on the way in would raise this."
          : v.raw.seconds > v.raw.parSeconds
            ? "Slower than par. Time only counts for a fifth, so do not rush placement to chase it."
            : "At or under par — nothing to gain here.";

    return { key, label, lost, costMon, reading, advice };
  });

  // Re-grasping is not one of the three terms — it is a deduction from all of
  // them — so it is reported as its own line rather than folded into placement,
  // where it would look like the payload had landed worse than it did.
  // The two deductions are reported apart rather than as one "penalty" figure.
  // They are different mistakes with different fixes, and a single combined
  // number would tell an operator who placed two objects backwards that they
  // had been re-grasping.
  const orderShare = v.raw.outOfOrder ? ORDER_PENALTY : 0;
  const regraspShare = Math.max(0, v.raw.penalty - orderShare);

  if (regraspShare > 0) {
    const lost = Math.round(regraspShare * 10000);
    out.push({
      key: "regrasp",
      label: "Re-grasping",
      lost,
      costMon: (rewardPerTrajectory * lost) / 10000,
      reading: `${v.raw.grasps} grasps, ${(regraspShare * 100).toFixed(0)}% deducted`,
      advice:
        "Putting the payload down and picking it up again is allowed and often the right call — it just makes the trajectory worth less as training data. The deduction stops at 15% however many times it happens.",
    });
  }

  if (orderShare > 0) {
    const lost = Math.round(orderShare * 10000);
    out.push({
      key: "order",
      label: "Placement order",
      lost,
      costMon: (rewardPerTrajectory * lost) / 10000,
      reading: `second payload came to rest first, ${(orderShare * 100).toFixed(0)}% deducted`,
      advice:
        "The instruction names the objects in the order they are meant to be placed. A recording that places them the other way round teaches the wrong sequence, so it is worth less — place the first-named object first.",
    });
  }

  return out.sort((a, b) => b.lost - a.lost);
}

/** How far below the pay threshold a rejected run fell, in score points. */
export function belowFloorBy(v: Verdict): number | null {
  if (v.success) return null;
  return Math.max(0, ACCEPT_FLOOR - v.score);
}
