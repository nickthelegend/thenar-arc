"use client";

import { useEffect, useState } from "react";

/**
 * What actually happened on each task, against what its funder declared.
 *
 * Difficulty is a number the funder picks when they post. It is a claim, and
 * every other claim on this site is checked against the record — so this one
 * is too. The record is the corpus: every episode, its task, and whether it
 * cleared the floor.
 *
 * The two do not agree here, and the disagreement is the point. Both tasks
 * declared hardest at 3 have paid every run driven on them; a task declared 2
 * has paid none of two. Declared difficulty is not predicting anything, which
 * a funder setting one and an operator choosing work both ought to know.
 *
 * The sample sizes are small and are always reported alongside, because "0 of
 * 2" and "0 of 200" are the same rate and not the same statement.
 */

export type Measured = {
  paid: number;
  failed: number;
  unsubmitted: number;
  /** Paid over paid-plus-failed. Null when nobody has submitted one either way:
   *  a rate over no attempts is not zero, it is unknown. */
  passRate: number | null;
};

type Episode = { taskId: number; outcome: "paid" | "failed" | "unsubmitted" };

export function useMeasured() {
  const [byTask, setByTask] = useState<Map<number, Measured> | null>(null);

  useEffect(() => {
    let live = true;
    // One request for the whole corpus rather than one per task. It is a few
    // kilobytes, and six round trips to draw one column is six too many.
    fetch("/api/corpus?outcome=all")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { episodes: Episode[] }) => {
        if (!live) return;
        const m = new Map<number, Measured>();
        for (const e of d.episodes) {
          const row = m.get(e.taskId) ?? { paid: 0, failed: 0, unsubmitted: 0, passRate: null };
          row[e.outcome] += 1;
          m.set(e.taskId, row);
        }
        for (const row of m.values()) {
          const submitted = row.paid + row.failed;
          row.passRate = submitted > 0 ? row.paid / submitted : null;
        }
        setByTask(m);
      })
      .catch(() => { if (live) setByTask(new Map()); });
    return () => { live = false; };
  }, []);

  return byTask;
}

/**
 * The clearest case where the declared order and the measured one disagree.
 *
 * Returns the pair worth naming: a task declared easier than another that has,
 * in fact, paid a smaller share of the runs submitted to it. Only over tasks
 * with attempts to count, and it returns nothing when the two orders agree —
 * a note that fires either way says nothing.
 */
export function contradiction(
  declared: { id: number; difficulty: number }[],
  measured: Map<number, Measured>,
): { easier: number; harder: number; easierRate: number; harderRate: number;
     easierN: number; harderN: number } | null {
  const withRuns = declared
    .map((t) => ({ ...t, m: measured.get(t.id) }))
    .filter((t): t is typeof t & { m: Measured } => Boolean(t.m) && t.m!.passRate !== null);

  let best: ReturnType<typeof contradiction> = null;
  let widest = 0;
  for (const a of withRuns) {
    for (const b of withRuns) {
      // a is declared easier than b, and did worse.
      if (a.difficulty >= b.difficulty) continue;
      const gap = b.m.passRate! - a.m.passRate!;
      if (gap <= 0 || gap <= widest) continue;
      widest = gap;
      best = {
        easier: a.id, harder: b.id,
        easierRate: a.m.passRate!, harderRate: b.m.passRate!,
        easierN: a.m.paid + a.m.failed, harderN: b.m.paid + b.m.failed,
      };
    }
  }
  return best;
}
