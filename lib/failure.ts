import { deviationFromSamples, GRIP_CLOSED_MM, TOLERANCE_MM } from "./score";
import { GOAL_R } from "./bench";
import { phasesOf, type Segmentable } from "./phases";

/**
 * Why a run did not work.
 *
 * The corpus now keeps the failures, which makes them worth something: a
 * negative example is only useful to train on if you know what it is an
 * example of. "Scored 6.6" says a run was bad. "The jaws never closed" says
 * what happened, and those are different labels to condition on.
 *
 * Read from the samples, like everything else here, so a buyer can rederive
 * the label rather than trust it — and so the reason shown to the operator on
 * the run page is the same string shipped in the dataset.
 *
 * Ordered by how early the run went wrong. A run that never picked the payload
 * up also, trivially, did not place it accurately, and reporting the second is
 * useless. The first thing that failed is the thing to say.
 */

export type FailureKind =
  | "never-grasped"
  | "dropped"
  | "never-reached-the-ring"
  | "outside-the-band"
  | "none";

export type Failure = {
  kind: FailureKind;
  /** One sentence, in the same voice as the rest of the site. */
  detail: string;
  /** Where it went wrong, when that is a specific frame. */
  atSample?: number;
};

/** Height above the table under which the payload is down rather than carried.
 *  Matches the phase segmenter, because they are answering the same question. */
const SETTLED_M = 0.03;

export function classifyFailure(samples: Segmentable[]): Failure {
  if (samples.length < 2) {
    return { kind: "none", detail: "Too short to say anything about." };
  }

  const phases = phasesOf(samples);
  const grasped = phases.some((p) => p.name === "grasp");

  if (!grasped) {
    return {
      kind: "never-grasped",
      detail: "The jaws never closed on the payload, so nothing was ever picked up.",
    };
  }

  // Released while the payload was still in the air: it was dropped rather
  // than set down, and the frame it happened on is worth having.
  const release = phases.find((p) => p.name === "release");
  if (release) {
    const at = release.from - 1;
    const height = samples[Math.max(0, at)]?.object[2] ?? 0;
    if (height > SETTLED_M) {
      return {
        kind: "dropped",
        detail: `Let go ${Math.round(height * 1000)} mm above the table — the payload fell rather than being placed.`,
        atSample: at,
      };
    }
  }

  const deviation = deviationFromSamples(samples);
  if (deviation > GOAL_R * 1000) {
    return {
      kind: "never-reached-the-ring",
      detail: `Came to rest ${Math.round(deviation)} mm from the datum, outside the ${Math.round(GOAL_R * 1000)} mm goal ring — it was not placed at all.`,
    };
  }
  if (deviation > TOLERANCE_MM) {
    return {
      kind: "outside-the-band",
      detail: `Placed, but ${deviation.toFixed(1)} mm from the datum against a ±${TOLERANCE_MM} mm band.`,
    };
  }

  return {
    kind: "none",
    detail: "The placement was inside the band; whatever lost the score was time or smoothness.",
  };
}

/** True while the jaws are shut. Exported because the taxonomy and the phase
 *  segmenter must agree on what "held" means or they will label the same run
 *  two different ways. */
export const isHeld = (s: Segmentable) => s.grip <= GRIP_CLOSED_MM;
