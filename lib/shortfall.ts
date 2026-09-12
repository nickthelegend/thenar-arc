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
 * cost at this task's rate, and the one sentence that says what to do
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

/**
 * What would have paid.
 *
 * A rejected run is told how far below the floor it fell, in score points,
 * which is a unit nobody drives in. An operator holds a joystick and puts a
 * payload somewhere; "5.2 points short" does not tell them where. The score is
 * a weighted sum of three terms they can each act on, so the same arithmetic
 * run backwards says what any one of them would have had to be.
 *
 * Solved for one term at a time with the other two held at what this run
 * actually did, because that is the question being asked: given the run I just
 * drove, what single thing would have made it pay. When a term cannot reach the
 * floor alone even at full marks, that is said instead of a number — a target
 * an operator cannot hit is worse than no target.
 */
export type WouldHavePaid = {
  /** Deviation, in mm, that alone would have cleared the floor. Null when even
   *  a perfect placement could not. */
  deviationMm: number | null;
  /** Mean jerk, in m/s³, that alone would have cleared it. Null likewise. */
  jerk: number | null;
  /** Seconds that alone would have cleared it. Null likewise, and also when the
   *  run was already at full marks for time. */
  seconds: number | null;
  /** True when no single term could have done it. */
  needsMoreThanOne: boolean;
};

export function wouldHavePaid(v: Verdict, parSeconds: number): WouldHavePaid | null {
  if (v.success) return null;
  // A run that never reached the goal ring is scored zero on every term by
  // construction, so there is no arithmetic to run backwards: it did not place
  // the payload at all, and the taxonomy says so in words instead.
  if (v.score === 0) {
    return { deviationMm: null, jerk: null, seconds: null, needsMoreThanOne: true };
  }

  const { placement, efficiency, smoothness } = v.parts;
  // The score is unit × (1 − penalty), so the unit share the floor needs
  // depends on what this run was already penalised.
  const scale = v.score / 10000 / (placement * W_PLACEMENT + efficiency * W_EFFICIENCY + smoothness * W_SMOOTHNESS);
  const unitNeeded = ACCEPT_FLOOR / 10000 / (scale > 0 ? scale : 1);

  /** The value one term must reach with the other two held where they are. */
  const solve = (weight: number, others: number) => {
    const need = (unitNeeded - others) / weight;
    return need > 1 ? null : Math.max(0, need);
  };

  const pNeed = solve(W_PLACEMENT, efficiency * W_EFFICIENCY + smoothness * W_SMOOTHNESS);
  const sNeed = solve(W_SMOOTHNESS, placement * W_PLACEMENT + efficiency * W_EFFICIENCY);
  const eNeed = solve(W_EFFICIENCY, placement * W_PLACEMENT + smoothness * W_SMOOTHNESS);

  return {
    // placement = 1 − deviation / tolerance
    deviationMm: pNeed === null ? null : TOLERANCE_MM * (1 - pNeed),
    // smoothness = (ceil − jerk) / (ceil − floor)
    jerk: sNeed === null ? null : JERK_CEIL - sNeed * (JERK_CEIL - JERK_FLOOR),
    // efficiency = par / max(par × 0.35, seconds), and a run already at full
    // marks has no faster time to name.
    seconds: eNeed === null || eNeed <= 0 || efficiency >= 1 ? null : parSeconds / eNeed,
    needsMoreThanOne: pNeed === null && sNeed === null && eNeed === null,
  };
}

/**
 * The same answer as a sentence, so both surfaces say it the same way.
 *
 * One clause per term that could have carried the run on its own, in the order
 * an operator can act on them: where the payload went, how smoothly, how fast.
 * When none could, it says that plainly rather than naming a target nobody
 * could hit.
 */
export function wouldHavePaidSentence(w: WouldHavePaid): string {
  if (w.needsMoreThanOne) {
    return "No single change would have carried it: even full marks on any one term leaves it under the floor.";
  }
  const parts: string[] = [];
  if (w.deviationMm !== null) {
    parts.push(`come to rest within ${w.deviationMm.toFixed(1)} mm of the seat`);
  }
  if (w.jerk !== null) {
    parts.push(`hold mean jerk under ${w.jerk.toFixed(1)} m/s³`);
  }
  if (w.seconds !== null) {
    parts.push(`finish inside ${Math.round(w.seconds)} s`);
  }
  if (!parts.length) {
    return "No single change would have carried it: even full marks on any one term leaves it under the floor.";
  }
  return `Any one of these would have paid: ${parts.join("; ")}.`;
}
