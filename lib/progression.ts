/**
 * What repeating a task actually did.
 *
 * The product's whole premise is that an operator drives the same task over and
 * over and the recordings get better — PRODUCT.md describes the real scene as
 * long and repetitive, the contract caps a contributor at five runs per task
 * precisely because repetition is the point, and the station's own copy tells
 * an operator to run it again. Nothing anywhere then said whether running it
 * again had helped. Every surface showed runs as a flat list: a best, a mean,
 * and a row per attempt, with the one number a repeat operator cares about —
 * did this one beat the last one — left for them to work out by eye.
 *
 * This is that subtraction, done once. It reports rather than judges: a decline
 * is named as plainly as a gain, because an operator who is getting worse is
 * the one who most needs to be told.
 */

export type ScoredRun = {
  /** 0..10000, as the contract holds it. */
  score: number;
  /**
   * Distance from the seat at rest, in millimetres, where it is known.
   *
   * Optional because the two records this reads from are not the same record.
   * The ledger keeps the measurement; the chain keeps the score and the payout
   * and has never held a deviation. A caller reading the chain alone can still
   * difference scores, and must not be made to invent a millimetre to do it.
   */
  deviationMm?: number;
  /** Wall-clock seconds the run took, where it is known. Same caveat. */
  durationS?: number;
  /** When it was recorded, in epoch milliseconds. */
  at: number;
  trajHash: string;
  taskId: number;
};

export type Step = {
  run: ScoredRun;
  /** Change from the run before it, in score points on the 0..10000 scale. */
  dScore: number | null;
  /** Negative is closer to the seat, which is better. Null when either run's
   *  deviation is unknown, rather than zero, which would read as "no change". */
  dDeviationMm: number | null;
  /** Negative is quicker. Null when either run's duration is unknown. */
  dDurationS: number | null;
  /** Whether this is the operator's best run on this task. Their best overall,
   *  not their best so far — marking the first attempt "best" because nothing
   *  had happened yet is a label that means nothing on the run it sits on. */
  best: boolean;
};

export type TaskProgression = {
  taskId: number;
  /** Oldest first: the order they were driven in, which is the order that makes
   *  a delta mean anything. */
  steps: Step[];
  first: number;
  last: number;
  bestScore: number;
  /** Last minus first, on the 0..10000 scale. */
  net: number;
};

/**
 * Group an operator's runs by task and difference them.
 *
 * Only tasks with more than one run come back. One run is not a progression,
 * and a section that listed it as one would be padding a page with a delta of
 * nothing.
 */
export function progressionByTask(runs: ScoredRun[]): TaskProgression[] {
  const byTask = new Map<number, ScoredRun[]>();
  for (const r of runs) {
    const list = byTask.get(r.taskId);
    if (list) list.push(r);
    else byTask.set(r.taskId, [r]);
  }

  const out: TaskProgression[] = [];
  for (const [taskId, list] of byTask) {
    if (list.length < 2) continue;
    // Oldest first. The feed hands them back newest first, and differencing in
    // that order reports every improvement as a decline.
    const ordered = [...list].sort((a, b) => a.at - b.at);

    const top = Math.max(...ordered.map((r) => r.score));
    const steps: Step[] = ordered.map((run, i) => {
      const prev = i > 0 ? ordered[i - 1] : null;
      return {
        run,
        dScore: prev ? run.score - prev.score : null,
        dDeviationMm:
          prev && run.deviationMm !== undefined && prev.deviationMm !== undefined
            ? run.deviationMm - prev.deviationMm
            : null,
        dDurationS:
          prev && run.durationS !== undefined && prev.durationS !== undefined
            ? run.durationS - prev.durationS
            : null,
        best: run.score === top,
      };
    });

    const first = ordered[0].score;
    const last = ordered[ordered.length - 1].score;
    out.push({
      taskId,
      steps,
      first,
      last,
      bestScore: top,
      net: last - first,
    });
  }

  // Most-repeated first, then most improved. An operator with four runs on one
  // task and two on another is telling you which one they are working on.
  return out.sort((a, b) => b.steps.length - a.steps.length || b.net - a.net);
}

/**
 * The sentence a progression comes to.
 *
 * Named in the terms an operator can act on — where the payload landed, and how
 * long it took — rather than only as a score delta, because "up 2.20" does not
 * tell anybody what to do differently next time.
 */
export function describe(p: TaskProgression): string {
  const n = p.steps.length;
  const dir = p.net > 0 ? "up" : p.net < 0 ? "down" : "level at";
  const head =
    p.net === 0
      ? `${n} runs, ${(p.first / 100).toFixed(2)} both times`
      : `${n} runs, ${(p.first / 100).toFixed(2)} to ${(p.last / 100).toFixed(2)} — ${dir} ${Math.abs(p.net / 100).toFixed(2)}`;

  const first = p.steps[0].run;
  const last = p.steps[n - 1].run;
  const dDev =
    first.deviationMm !== undefined && last.deviationMm !== undefined
      ? last.deviationMm - first.deviationMm
      : null;
  const dTime =
    first.durationS !== undefined && last.durationS !== undefined
      ? last.durationS - first.durationS
      : null;

  const parts: string[] = [];
  if (dDev !== null && Math.abs(dDev) >= 0.1) {
    parts.push(
      dDev < 0
        ? `${Math.abs(dDev).toFixed(1)} mm closer to the seat`
        : `${dDev.toFixed(1)} mm further out`,
    );
  }
  if (dTime !== null && Math.abs(dTime) >= 1) {
    parts.push(dTime < 0 ? `${Math.abs(Math.round(dTime))} s quicker` : `${Math.round(dTime)} s slower`);
  }

  return parts.length ? `${head}. ${parts.join(", ")}.` : `${head}.`;
}
