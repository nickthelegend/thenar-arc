"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearTally, meanScore, minutes, readTally, type Tally } from "@/lib/session-tally";
import { CURRENCY } from "@/lib/chain";
import { fmtMon, fmtScore } from "@/lib/format";

/**
 * The sitting you just came out of, carried to the page you left for.
 *
 * The station keeps a running tally of the sitting because sessions on this
 * bench are long and repetitive. It vanished the moment the operator left,
 * which is exactly the moment they want it: they leave to pick the next task,
 * and the question in their head on the way out is how the last stretch went.
 *
 * The tally already survived the trip — it is in sessionStorage, scoped to the
 * tab — so nothing new is stored. What was missing was a place for it to show
 * up. Read on mount rather than during render because sessionStorage does not
 * exist on the server, and a first paint that disagrees with the second is a
 * hydration error.
 */
export function Sitting({ className }: { className?: string }) {
  const [tally, setTally] = useState<Tally | null>(null);
  useEffect(() => setTally(readTally()), []);

  if (!tally || tally.measured === 0) return null;

  const mins = minutes(tally);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border border-rule bg-ink-1 px-4 py-3">
        <span className="label">This sitting</span>
        <Cell label="Measured" value={String(tally.measured)} />
        <Cell label="Paid" value={String(tally.paid)} />
        <Cell label="Best" value={tally.best ? fmtScore(tally.best) : "—"} tone />
        <Cell label="Mean" value={tally.measured ? fmtScore(Math.round(meanScore(tally))) : "—"} />
        <Cell label="Earned" value={`${fmtMon(tally.earned, 4)} ${CURRENCY}`} tone />
        <Cell label="At the bench" value={`${mins.toFixed(0)} min`} />

        <span className="ml-auto flex items-center gap-4">
          {tally.taskId !== undefined ? (
            <Link
              href={`/station/${tally.taskId}`}
              className="font-mono text-[12px] uppercase tracking-[0.12em] text-signal hover:text-signal-hi"
            >
              Back to #{tally.taskId} &rarr;
            </Link>
          ) : null}
          {/* Only the operator ends a sitting. Nothing on this page resets it
              on their behalf — a tally that cleared itself when somebody looked
              at the hub would lose the thing it exists to keep. */}
          <button
            type="button"
            onClick={() => { clearTally(); setTally(readTally()); }}
            className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3 transition-colors hover:text-scribe"
          >
            End sitting
          </button>
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-scribe-3">
        This tab only. Every figure is also on chain independently.
      </p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={`font-mono text-[14px] tabular-nums ${tone ? "text-signal" : "text-scribe"}`}>
        {value}
      </span>
    </span>
  );
}
