import type { Sample } from "@/lib/types";
import { toolPosition } from "@/lib/kinematics";

/**
 * Whether a recording's arm and its payload describe the same event.
 *
 * A trajectory has two independent columns: the joint angles, and the
 * payload's pose. Nothing in the format forces them to agree — a run can
 * report jaws closed while the tool is two hundred millimetres from the object
 * it is supposedly holding, and every other check will pass. The hash will
 * verify, the signature will verify, the payout is real. It is simply not a
 * demonstration of anything.
 *
 * That is not hypothetical. Twenty of the first thirty-five runs on this
 * ledger are like that, and all twenty are mine: submissions from test scripts
 * whose joint angles were a linear ramp rather than the pose that produced the
 * payload's motion. A behaviour-cloning policy trained on the corpus including
 * them learns that the tool's position is unrelated to the payload's, which is
 * the one thing it must not learn. Trained without them, on what is left, it
 * still fails — twelve episodes is not a corpus.
 *
 * So this is the measurement a buyer needs before paying, and the reason it
 * exists is that its absence was expensive.
 */

/** Beyond this, the tool cannot be holding the object it says it is holding.
 *  A real grasp puts the tool inside the capture radius and half a payload
 *  height of the object, so anything under this is consistent with a hold. */
export const COHERENT_MM = 60;

/** Fewer held frames than this and there is nothing to measure. */
const MIN_HELD = 20;

/** Jaw opening below which the jaws are holding something, in mm. */
const GRIP_CLOSED_MM = 14;

export type Coherence = {
  /** Median distance between the tool and the payload while the jaws are
   *  closed, in millimetres. */
  medianMm: number | null;
  /** How many frames the jaws were closed for. */
  heldFrames: number;
  coherent: boolean;
  reading: string;
};

export function coherenceOf(samples: Sample[]): Coherence {
  const held = samples.filter((s) => s.grip <= GRIP_CLOSED_MM && Array.isArray(s.q));
  if (held.length < MIN_HELD) {
    return {
      medianMm: null,
      heldFrames: held.length,
      coherent: false,
      reading: held.length === 0
        ? "the jaws never closed, so nothing was carried"
        : `only ${held.length} frames with the jaws closed — too few to judge`,
    };
  }

  const d = held
    .map((s) => {
      // Forward kinematics on the angles as recorded. Not re-solved: the
      // question is where this recording's arm actually was, not where a
      // solver would have put it.
      const t = toolPosition({ j1: s.q[0], j2: s.q[1], j3: s.q[2], j5: s.q[4], clamped: false });
      return Math.hypot(t[0] - s.object[0], t[1] - s.object[1]);
    })
    .sort((a, b) => a - b);

  const medianMm = d[d.length >> 1] * 1000;
  const coherent = medianMm < COHERENT_MM;
  return {
    medianMm,
    heldFrames: held.length,
    coherent,
    reading: coherent
      ? `the tool stayed ${medianMm.toFixed(0)} mm from the payload while carrying it`
      : `the tool was ${medianMm.toFixed(0)} mm from the payload while the jaws were closed — ` +
        `the arm and the object in this recording are not describing the same event`,
  };
}
