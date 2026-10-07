import { GRIP_CLOSED_MM } from "./score";
import type { Sample } from "./types";

/**
 * What happened, and when, inside one recording.
 *
 * A trajectory leaves here as one undifferentiated block of twenty-hertz
 * frames. That is the raw material and it is not what anybody trains on: a
 * policy is conditioned on phase — reach and transport are different problems,
 * and the interesting failures cluster at the boundaries between them. Every
 * buyer of this corpus would have to segment it themselves, from exactly the
 * columns that are already here, and they would each do it slightly
 * differently.
 *
 * So it is done once, here, and shipped with the data.
 *
 * Derived from the samples and nothing else, for the same reason the score is:
 * the segmentation has to be reproducible by whoever downloads the corpus, or
 * it is an annotation they have to take on faith. Two signals carry all of it —
 * the jaw opening says when the payload was held, and the payload's own height
 * says when it was being carried and when it was being set down.
 */

export type PhaseName = "reach" | "grasp" | "transport" | "place" | "release";

/**
 * The columns segmentation actually reads.
 *
 * Narrower than a Sample on purpose: the jaw opening says when the payload was
 * held and its height says when it was carried, and the joint angles say
 * nothing this needs. Asking for them would stop a replay's frames — which
 * carry q optionally — from being segmented at all, for a column never read.
 */
export type Segmentable = Pick<Sample, "t" | "grip" | "object">;

export type Phase = {
  name: PhaseName;
  /** Inclusive first sample index. */
  from: number;
  /** Exclusive last sample index, so `samples.slice(from, to)` is the phase. */
  to: number;
  /** Seconds, from the samples' own clock. */
  seconds: number;
};

/** Height above the table, in metres, under which the payload counts as set
 *  down rather than carried. One payload radius: below this it is close enough
 *  to the surface that the operator is placing rather than moving. */
const SETTLED_M = 0.03;

/** A grasp shorter than this is a bounce off the payload rather than a hold,
 *  and treating it as the start of transport would put the boundary in the
 *  wrong place. Two frames at 20 Hz. */
const MIN_HOLD_FRAMES = 2;

const held = (s: Segmentable) => s.grip <= GRIP_CLOSED_MM;

/**
 * The frame the payload was first held for real, and the frame it was last
 * let go. A re-grasp in between does not restart the run — the operator is
 * correcting, and the transport phase covers the whole of it.
 */
function holdSpan(samples: Segmentable[]): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  let runStart = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (held(samples[i])) {
      if (runStart < 0) runStart = i;
      if (i - runStart + 1 >= MIN_HOLD_FRAMES) {
        if (first < 0) first = runStart;
        last = i;
      }
    } else {
      runStart = -1;
    }
  }
  return first < 0 ? null : { first, last };
}

/**
 * Cut a recording into its phases.
 *
 * A run that never closed the jaws has no grasp and no transport, and is
 * reported as one long reach rather than being forced into a shape it does not
 * have — those exist, they are the runs where the operator never got hold of
 * the payload, and calling that a transport of zero frames would be a lie in
 * the data rather than an absence in it.
 */
export function phasesOf(samples: Segmentable[]): Phase[] {
  if (samples.length < 2) return [];
  const at = (i: number) => samples[Math.min(i, samples.length - 1)].t;
  const span = (from: number, to: number) => Math.max(0, at(to) - at(from));

  const hold = holdSpan(samples);
  if (!hold) {
    return [{ name: "reach", from: 0, to: samples.length, seconds: span(0, samples.length - 1) }];
  }

  // The grasp is the closing itself: the frames between the jaws starting to
  // shut and the payload actually being held.
  let graspFrom = hold.first;
  while (graspFrom > 0 && samples[graspFrom - 1].grip < samples[graspFrom - 1 + 1].grip) graspFrom -= 1;

  // Placing starts when the payload comes down for the last time before it is
  // released — searched backwards from the release so a mid-run dip does not
  // claim the operator was already setting it down.
  let placeFrom = hold.last;
  while (placeFrom > graspFrom && samples[placeFrom].object[2] <= SETTLED_M) placeFrom -= 1;
  placeFrom = Math.min(placeFrom + 1, hold.last);

  const out: Phase[] = [];
  const push = (name: PhaseName, from: number, to: number) => {
    if (to > from) out.push({ name, from, to, seconds: span(from, to - 1) });
  };

  push("reach", 0, graspFrom);
  push("grasp", graspFrom, hold.first + 1);
  push("transport", hold.first + 1, placeFrom);
  push("place", placeFrom, hold.last + 1);
  push("release", hold.last + 1, samples.length);
  return out;
}

/** Seconds spent in each phase, for a corpus summary. Absent phases are absent
 *  rather than zero: a run with no grasp did not spend no time grasping, it
 *  never grasped. */
export function phaseSeconds(samples: Segmentable[]): Partial<Record<PhaseName, number>> {
  const out: Partial<Record<PhaseName, number>> = {};
  for (const p of phasesOf(samples)) out[p.name] = (out[p.name] ?? 0) + p.seconds;
  return out;
}
