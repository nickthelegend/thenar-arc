import type { Sample } from "@/lib/types";
import { toolFor } from "@/lib/embodiment";
import type { ArmKind } from "@/lib/scan";
import { ARM_B_BASE, startPoses } from "@/lib/bench";

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

export function coherenceOf(samples: Sample[], arm: ArmKind = "thenar6"): Coherence {
  const fk = toolFor(arm);
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
      const t = fk(s.q);
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

// ---- at signing time ------------------------------------------------------------

/** A payload drifting this far in the table plane with no jaws on it, summed
 *  over the run, is a payload the arm did not move. */
export const UNCARRIED_MM = 15;
/** How close a closed tool has to be to a moving payload to be carrying it. */
const CARRY_MM = 60;
/** How far from its start a payload may stand in a recording's first frame. */
const START_MM = 10;

export type ArmColumns = {
  /** The task's arm: which forward kinematics reads `q`. */
  arm: ArmKind;
  /** Where the task's payloads start (bench.startFor), so a recording cannot
   *  begin with the payload already on its goal. */
  start: readonly [number, number];
};

/**
 * Whether the arm in a recording could have done what the payload in it did.
 *
 * `coherenceOf` answers that for a buyer, after the fact, and until now it was
 * only ever asked after the fact: the verifier signed a perfect score for a
 * recording whose arm never moved while its payload glided onto the goal. So
 * this is asked before signing. Every frame in which a payload moves across
 * the table has to have a closed tool, of some arm in the scene, on it; the
 * payloads have to begin where the task puts them. A run driven in the
 * station passes by construction, because that is the rule the station
 * itself applies. Returns why the recording fails, or null.
 */
export function physicalityOf(samples: Sample[], { arm, start }: ArmColumns): string | null {
  if (samples.length < 2) return "the recording is too short to judge";
  const fk = toolFor(arm);
  const fkB = toolFor("thenar6");
  const tools = (s: Sample): { at: [number, number, number]; closed: boolean }[] => {
    const out = [{ at: fk(s.q), closed: s.grip <= GRIP_CLOSED_MM }];
    if (s.q2) {
      const t = fkB(s.q2);
      out.push({ at: [t[0] + ARM_B_BASE[0], t[1] + ARM_B_BASE[1], t[2]], closed: (s.grip2 ?? 99) <= GRIP_CLOSED_MM });
    }
    return out;
  };
  const cols = (s: Sample) => (s.object2 ? [s.object, s.object2] : [s.object]);

  const first = cols(samples[0]);
  const expected = startPoses(start, first.length);
  for (let k = 0; k < first.length; k++) {
    const off = Math.hypot(first[k][0] - expected[k][0], first[k][1] - expected[k][1]) * 1000;
    if (off > START_MM) return `the payload begins ${off.toFixed(0)} mm from where this task puts it`;
  }

  let uncarried = 0;
  for (let i = 1; i < samples.length; i++) {
    const now = cols(samples[i]), before = cols(samples[i - 1]);
    const hands = tools(samples[i]);
    for (let k = 0; k < now.length; k++) {
      const moved = Math.hypot(now[k][0] - before[k][0], now[k][1] - before[k][1]);
      if (moved < 0.0005) continue;
      const carried = hands.some((h) => h.closed && Math.hypot(h.at[0] - now[k][0], h.at[1] - now[k][1]) * 1000 < CARRY_MM);
      if (!carried) uncarried += moved * 1000;
    }
  }
  if (uncarried > UNCARRIED_MM) {
    return `the payload moves ${uncarried.toFixed(0)} mm across the table with no closed jaws on it — the arm in this recording did not move it`;
  }
  return null;
}
