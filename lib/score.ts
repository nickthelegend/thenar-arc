import { GOAL, GOAL_R, seatFor } from "./bench";
import type { Sample, Trajectory, Verdict } from "./types";

/**
 * Deterministic evaluation. The same trajectory always produces the same
 * score, on the client and on the verifier, because the on-chain payout is
 * derived from it and a drifting score would be an unauditable payout.
 *
 * Three measurements, each on 0..1, combined by weight:
 *
 *   placement   how close the payload came to rest on the goal datum
 *   efficiency  completion time against the task's own par
 *   smoothness  mean jerk of the tool path, low is good
 */

export const TOLERANCE_MM = 25;      // placement band, half-width

/**
 * Mean-jerk band, m/s^3, measured from real runs driven through the station at
 * the recorder's 20 Hz — not from a synthetic path, which reads an order of
 * magnitude lower and made this term score zero for everybody.
 *
 *   careful driving, one continuous motion per axis .... 25.9
 *   snatchy driving, tapping instead of holding ........ 51.3
 *
 * The band is set just outside both so a good run keeps most of the term and a
 * snatchy one loses most of it.
 */
export const JERK_FLOOR = 18;   // at or below this, full marks
export const JERK_CEIL = 60;    // at or above this, none

/** The columns a placement is measured from: where the payloads finished, and
 *  nothing else. Narrower than a Sample so a replay's frames — which carry the
 *  joint angles optionally — can still be measured. */
export type Placeable = Pick<Sample, "object" | "object2">;

export const W_PLACEMENT = 0.55;
export const W_EFFICIENCY = 0.2;
export const W_SMOOTHNESS = 0.25;

/** Score below this is rejected: it never reaches the training pool. */
export const ACCEPT_FLOOR = 4000;

/** Jaw opening below which the jaws are holding something, in mm. */
export const GRIP_CLOSED_MM = 14;
/** What each grasp after the first costs, as a fraction of the final score. */
export const REGRASP_PENALTY = 0.03;
/** The most re-grasping can cost, however many times it happens. */
export const REGRASP_PENALTY_CAP = 0.15;

/**
 * What placing a two-object scene backwards costs.
 *
 * A scene that names two payloads names them in an order — "put the spoon and
 * the mug into the crate" is a sequence, and a policy trained on recordings
 * that ignore the sequence learns the wrong task. It is a deduction rather
 * than a rejection because the recording is still a real manipulation, and it
 * is derived from the samples alone so the verifier reaches the same number
 * from the same bytes.
 */
export const ORDER_PENALTY = 0.08;

/**
 * Whether the payloads were placed in the order the instruction named them.
 *
 * "Placed" is read as "came to rest for the last time": the sample after which
 * an object never moves again. No knowledge of where the seats are is needed —
 * only which object stopped first — which is what keeps this computable from a
 * trajectory on its own, by anyone, without the station's geometry.
 */
export function placedInOrder(samples: Sample[]): boolean {
  if (!samples.some((s) => s.object2)) return true;

  const lastMove = (pick: (s: Sample) => number[] | undefined): number => {
    let last = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = pick(samples[i - 1]);
      const b = pick(samples[i]);
      if (!a || !b) continue;
      // A millimetre: below this is the recorder's own noise, not motion.
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 0.001) last = i;
    }
    return last;
  };

  return lastMove((s) => s.object) <= lastMove((s) => s.object2);
}

/**
 * How many times the payload was taken during a run.
 *
 * Derived from the samples rather than reported by the client, which is the
 * only way it can be part of a signed score: the server re-derives it from the
 * same recording and gets the same number, so there is nothing to lie about.
 *
 * A re-grasp is a legitimate correction — put it down, line it up, pick it up
 * again — and the run should be allowed to continue rather than be thrown away.
 * But a trajectory assembled from six attempts is worth less as training data
 * than one clean approach, so it costs something and the cost is bounded.
 */
export function graspCount(samples: Sample[]): number {
  let grasps = 0;
  let holding = false;
  for (const s of samples) {
    const closed = s.grip <= GRIP_CLOSED_MM;
    if (closed && !holding) grasps += 1;
    holding = closed;
  }
  return grasps;
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

/**
 * How far the payloads finished from where they were meant to finish, in mm.
 *
 * Placement is 55% of the score and it used to be read off a number the
 * submitter put in the request. Everything else the score is made of — jerk,
 * grasp count, placement order — is derived from the samples precisely because
 * a signed score cannot rest on a claim, and this one term was the exception:
 * the verifier signed "came to rest 2 mm from the datum" because it had been
 * told so, having the whole recording in front of it the entire time.
 *
 * The measurement is the station's own, moved rather than reinvented: distance
 * in the table plane from each payload to its seat, and the worst of them,
 * because a scene is placed when all of it is. Height is excluded for the same
 * reason it always was — the tool cannot descend below 12 mm and the payload's
 * waist sits at 37.5 mm, so vertical error is furniture, not aim.
 *
 * The resting position is the last sample's. After a payload's final movement
 * its position does not change, so the end of the recording is where it came
 * to rest, and no search for that moment is needed.
 */
export function deviationFromSamples(samples: Placeable[], goal: readonly [number, number] = GOAL): number {
  const last = samples[samples.length - 1];
  if (!last) return Infinity;

  const resting: [number, number, number][] = last.object2
    ? [last.object, last.object2]
    : [last.object];

  let worst = 0;
  for (let i = 0; i < resting.length; i += 1) {
    const seat = seatFor(goal, i, resting.length);
    worst = Math.max(worst, Math.hypot(resting[i][0] - seat[0], resting[i][1] - seat[1]) * 1000);
  }
  return worst;
}

/**
 * How long the run took, from the recording's own clock.
 *
 * The other half of the same problem as the deviation: efficiency is 20% of
 * the score and was read from a `durationSeconds` in the request, so a run
 * could be described as fast without having been fast.
 *
 * The samples carry timestamps because the recorder writes one per frame, so
 * the elapsed time is the span between the first and the last. Compressing
 * those timestamps to claim a quick run is not a way around this: jerk is a
 * third derivative and divides by dt cubed, so halving the clock multiplies
 * the measured jerk eightfold and the smoothness term collapses. The two
 * readings are taken from the same numbers and constrain each other, which is
 * what a single reported figure never did.
 */
export function durationFromSamples(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  const span = samples[samples.length - 1].t - samples[0].t;
  // A recording whose clock runs backwards or not at all is not a duration.
  // Zero reads as "no time passed", which scores efficiency at its ceiling, so
  // it is refused rather than rewarded.
  return Number.isFinite(span) && span > 0 ? span : 0;
}

/**
 * Whether the payloads finished inside the goal ring at all.
 *
 * Distinct from placement, which grades how well: the ring is 75 mm and the
 * scoring band is 25 mm, so a run can be inside the ring and still score zero
 * for placement. Outside it, nothing was placed and no part of the score is
 * earned.
 *
 * Derived here for the same reason the deviation is. `success` arrived as a
 * flag in the request, and a flag that gates every term of the score is worth
 * more to a liar than the placement figure it sat next to.
 */
export function placedInRing(samples: Placeable[], goal: readonly [number, number] = GOAL): boolean {
  return deviationFromSamples(samples, goal) <= GOAL_R * 1000;
}

/** Mean magnitude of the third derivative of the tool path, in m/s^3. */
export function meanJerk(samples: Sample[]): number {
  if (samples.length < 4) return 0;
  const p = samples.map((s) => s.object);
  const dt = Math.max(1e-3, samples[1].t - samples[0].t);
  let total = 0;
  let n = 0;
  for (let i = 3; i < p.length; i += 1) {
    let sq = 0;
    for (let a = 0; a < 3; a += 1) {
      const j = (p[i][a] - 3 * p[i - 1][a] + 3 * p[i - 2][a] - p[i - 3][a]) / (dt * dt * dt);
      sq += j * j;
    }
    total += Math.sqrt(sq);
    n += 1;
  }
  return n ? total / n : 0;
}

export function evaluate(
  traj: Trajectory,
  parSeconds: number,
  rewardPerTrajectory: number,
  /** The task's own datum (bench.goalFor); the shared bench GOAL unless it was scanned. */
  goal: readonly [number, number] = GOAL,
): Verdict {
  // Measured, not accepted. `traj.deviationMm` is what the submitter said and
  // is kept only to be reported back beside this; every term below is computed
  // from the recording, which is the same recording the trajectory hash is
  // derived from, so the score and the artefact cannot disagree.
  const deviationMm = deviationFromSamples(traj.samples, goal);

  // Both have to hold. The caller can still say a run failed — an operator who
  // abandons a run should not be scored on where the payload happened to be —
  // but it can no longer say one succeeded that the samples show did not.
  const success = traj.success && deviationMm <= GOAL_R * 1000;

  const placement = success ? clamp01(1 - deviationMm / TOLERANCE_MM) : 0;

  // Timed by the recording, not by the request. Guarded against a zero span
  // because the ratio below reads "no time passed" as the fastest possible run
  // and would hand full marks to a recording with no clock at all.
  const seconds = durationFromSamples(traj.samples);
  const efficiency = success && seconds > 0
    ? clamp01(parSeconds / Math.max(parSeconds * 0.35, seconds))
    : 0;

  const jerk = meanJerk(traj.samples);
  const smoothness = success
    ? clamp01((JERK_CEIL - jerk) / (JERK_CEIL - JERK_FLOOR))
    : 0;

  const unit =
    placement * W_PLACEMENT + efficiency * W_EFFICIENCY + smoothness * W_SMOOTHNESS;

  // Every grasp after the first, bounded. Applied last so it reads as a
  // deduction from the run's own quality rather than as a fourth term.
  const grasps = graspCount(traj.samples);
  const regrasp = Math.min(REGRASP_PENALTY_CAP, Math.max(0, grasps - 1) * REGRASP_PENALTY);
  // Zero on every single-payload run, which is why runs recorded before scenes
  // could carry two score exactly as they always did.
  const order = placedInOrder(traj.samples) ? 0 : ORDER_PENALTY;
  const penalty = Math.min(1, regrasp + order);

  const score = Math.round(clamp01(unit) * (1 - penalty) * 10000);
  const accepted = success && score >= ACCEPT_FLOOR;

  return {
    score,
    success: accepted,
    // The measured figure, so everything downstream — the ledger row, the run
    // page, the shortfall note — shows what the samples say rather than what
    // the request said.
    deviationMm,
    parts: { placement, efficiency, smoothness },
    raw: {
      meanJerk: jerk, seconds, parSeconds, grasps, penalty,
      outOfOrder: order > 0,
      /** The duration the submitter reported, against the measured `seconds`. */
      claimedSeconds: traj.durationSeconds,
      // What the submitter claimed, kept so a disagreement is visible rather
      // than silently overwritten. The station computes its figure a frame
      // later than the last sample, so a fraction of a millimetre apart is
      // ordinary; far apart is worth seeing.
      claimedDeviationMm: traj.deviationMm,
    },
    payoutMon: accepted ? (rewardPerTrajectory * score) / 10000 : 0,
  };
}
