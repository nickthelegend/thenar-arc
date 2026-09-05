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
 * Mean-jerk reference, m/s^3, measured against real paths at the recorder's
 * 20 Hz (scripts/probe-jerk.ts): an ideal interpolated path reads ~0, a path
 * driven by held keys with normal start/stop reads ~0.35, and one driven by
 * tapping the keys reads ~100. Scoring against 3.0 puts ordinary careful
 * driving near the top of the band and leaves room to lose it by snatching.
 */
export const JERK_REF = 3.0;

export const W_PLACEMENT = 0.55;
export const W_EFFICIENCY = 0.2;
export const W_SMOOTHNESS = 0.25;

/** Score below this is rejected: it never reaches the training pool. */
export const ACCEPT_FLOOR = 4000;

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

  const smoothness = traj.success ? clamp01(1 - meanJerk(traj.samples) / JERK_REF) : 0;

  const unit =
    placement * W_PLACEMENT + efficiency * W_EFFICIENCY + smoothness * W_SMOOTHNESS;

  const score = Math.round(clamp01(unit) * 10000);
  const accepted = traj.success && score >= ACCEPT_FLOOR;

  return {
    score,
    success: accepted,
    deviationMm: traj.deviationMm,
    parts: { placement, efficiency, smoothness },
    payoutMon: accepted ? (rewardPerTrajectory * score) / 10000 : 0,
  };
}
