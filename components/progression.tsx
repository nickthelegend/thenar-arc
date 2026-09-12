"use client";

import Link from "next/link";
import { describe, progressionByTask, type ScoredRun } from "@/lib/progression";
import { fmtScore, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Repeated runs on one task, differenced.
 *
 * Laid out as a run of cells rather than a chart. Two to five points is not a
 * trend line — drawing one would give a two-run pair the authority of a curve —
 * and the numbers are the thing an operator wants anyway: what it scored, and
 * what that was against the run before it.
 *
 * A decline is coloured exactly as loudly as a gain. The point of the panel is
 * to say what happened, and a version that only lit up for improvements would
 * be a scoreboard for the product rather than an instrument for the operator.
 */
export function Progression({ runs, className }: { runs: ScoredRun[]; className?: string }) {
  const groups = progressionByTask(runs);
  if (!groups.length) return null;

  return (
    <div className={className}>
      {groups.map((p) => (
        <section key={p.taskId} className="mt-5 first:mt-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              href={`/task/${p.taskId}`}
              className="font-mono text-[13px] text-scribe hover:text-signal"
            >
              Task #{p.taskId}
            </Link>
            <span className="text-[13px] leading-relaxed text-scribe-2">{describe(p)}</span>
          </div>

          <ol className="mt-2 flex flex-wrap gap-px bg-rule">
            {p.steps.map((s, i) => (
              <li
                key={s.run.trajHash}
                className="flex min-w-[128px] flex-1 flex-col gap-1 bg-ink-1 px-3 py-2.5"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="label">Run {i + 1}</span>
                  {s.best && p.steps.length > 1 ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
                      best
                    </span>
                  ) : null}
                </span>
                <Link
                  href={`/run/${s.run.trajHash}`}
                  className="font-mono text-[16px] tabular-nums text-scribe hover:text-signal"
                >
                  {fmtScore(s.run.score)}
                </Link>
                <span className="font-mono text-[11px] tabular-nums text-scribe-3">
                  {s.dScore === null ? (
                    "first attempt"
                  ) : (
                    <span className={cn(s.dScore > 0 ? "text-go" : s.dScore < 0 ? "text-reject" : "")}>
                      {s.dScore > 0 ? "+" : s.dScore < 0 ? "−" : "±"}
                      {Math.abs(s.dScore / 100).toFixed(2)}
                    </span>
                  )}
                  {s.run.deviationMm !== undefined ? ` · ${s.run.deviationMm.toFixed(1)} mm` : ""}
                </span>
                <span className="font-mono text-[11px] text-scribe-3">
                  {shortHash(s.run.trajHash)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
