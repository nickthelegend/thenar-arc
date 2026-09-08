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
): Verdict {
  const placement = traj.success
    ? clamp01(1 - Math.abs(traj.deviationMm) / TOLERANCE_MM)
    : 0;

  const efficiency = traj.success
    ? clamp01(parSeconds / Math.max(parSeconds * 0.35, traj.durationSeconds))
    : 0;

  const jerk = meanJerk(traj.samples);
  const smoothness = traj.success
    ? clamp01((JERK_CEIL - jerk) / (JERK_CEIL - JERK_FLOOR))
    : 0;

  const unit =
    placement * W_PLACEMENT + efficiency * W_EFFICIENCY + smoothness * W_SMOOTHNESS;

  // Every grasp after the first, bounded. Applied last so it reads as a
  // deduction from the run's own quality rather than as a fourth term.
  const grasps = graspCount(traj.samples);
  const penalty = Math.min(REGRASP_PENALTY_CAP, Math.max(0, grasps - 1) * REGRASP_PENALTY);

  const score = Math.round(clamp01(unit) * (1 - penalty) * 10000);
  const accepted = traj.success && score >= ACCEPT_FLOOR;

  return {
    score,
    success: accepted,
    deviationMm: traj.deviationMm,
    parts: { placement, efficiency, smoothness },
    raw: { meanJerk: jerk, seconds: traj.durationSeconds, parSeconds, grasps, penalty },
    payoutMon: accepted ? (rewardPerTrajectory * score) / 10000 : 0,
  };
}
