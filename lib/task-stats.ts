/**
 * What a task's own runs say about it.
 *
 * A funder sets `difficulty` when they post, which is a guess. The runs are
 * evidence. Two honest measures come out of them:
 *
 * **Observed difficulty**, from the mean score operators actually achieve. Note
 * what this is *not*: a pass rate. A run that misses the datum is never written
 * to the chain, so failures leave no record and the true pass rate is not
 * knowable from chain state. Presenting one would mean inventing the
 * denominator. What is knowable is how well the runs that did land scored.
 *
 * **Fill rate**, from the timestamps of the runs themselves — how fast slots are
 * going, and when the task runs out at that pace.
 */

export type Run = { score: number; created_at: number };

export type TaskStats = {
  runs: number;
  meanScore: number;
  /** 1..5, on the same scale the funder used, from the mean score achieved. */
  observed: number | null;
  /** Slots filled per hour, over the span the runs actually cover. */
  perHour: number | null;
  /** Milliseconds until full at the observed pace, or null if it cannot be said. */
  fillsIn: number | null;
};

/** Mean score 100 -> difficulty 1, mean score 40 (the pay floor) -> difficulty 5. */
function observedFrom(meanScore: number): number {
  const pct = meanScore / 100; // score is 0..10000
  const d = 1 + ((100 - pct) / 60) * 4;
  return Math.min(5, Math.max(1, Math.round(d)));
}

export function taskStats(runs: Run[], slotsTotal: number, slotsFilled: number): TaskStats {
  if (runs.length === 0) {
    return { runs: 0, meanScore: 0, observed: null, perHour: null, fillsIn: null };
  }

  const meanScore = runs.reduce((n, r) => n + r.score, 0) / runs.length;

  // The pace is only meaningful over a span. One run, or a burst inside a
  // minute, says nothing about how long the rest will take.
  const times = runs.map((r) => r.created_at).sort((a, b) => a - b);
  const spanMs = times[times.length - 1] - times[0];
  const enoughSpan = runs.length >= 3 && spanMs > 5 * 60_000;

  const perHour = enoughSpan ? (runs.length - 1) / (spanMs / 3_600_000) : null;
  const remaining = Math.max(0, slotsTotal - slotsFilled);
  const fillsIn = perHour && perHour > 0 && remaining > 0
    ? (remaining / perHour) * 3_600_000
    : null;

  return { runs: runs.length, meanScore, observed: observedFrom(meanScore), perHour, fillsIn };
}
