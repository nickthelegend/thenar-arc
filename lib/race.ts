/**
 * Racing a recorded run: which recording to race, and where it was at a moment.
 *
 * The ghost at the station is the task's best paid run, posed from its own
 * samples at the time the operator's run has reached, so the two can be
 * compared as they happen rather than afterwards on a scoreboard.
 */

/** The sample a recording was showing at `t` seconds: the last one at or before it, clamped to the ends. */
export function sampleAt<T extends { t: number }>(samples: readonly T[], t: number): T | null {
  if (!samples.length) return null;
  if (t <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid;
  }
  return samples[lo];
}

export type RunRow = { traj_hash: string; score: number; duration_s: number };

/** The run to race: the highest score, and of equals the quicker one. */
export function pickBest<R extends RunRow>(runs: readonly R[]): R | null {
  let best: R | null = null;
  for (const r of runs) {
    if (!best || r.score > best.score || (r.score === best.score && r.duration_s < best.duration_s)) best = r;
  }
  return best;
}

/** Seek a ghost by the operator's elapsed run time, even when enabled mid-run. */
export function raceSampleAt<T extends { t: number }>(samples: readonly T[], elapsed: number): T | null {
  return samples.length ? sampleAt(samples, samples[0].t + Math.max(0, elapsed)) : null;
}
