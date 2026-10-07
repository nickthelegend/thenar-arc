"use client";

import { useEffect, useState } from "react";
import { fmtInt, fmtPercent, fmtScore } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * What happened to everyone who tried this task.
 *
 * This page used to say a pass rate was not knowable, because a run that
 * misses the datum never reaches the chain. That was true about the chain and
 * wrong about the record: the verifier scores every run it is sent and keeps
 * it either way, so the misses were on file the whole time.
 *
 * The denominator is the part worth being careful about. A run that scored
 * well and was never signed is not a failure — the operator closed the tab, or
 * rejected the wallet prompt — and counting it as one would make the rate move
 * whenever somebody changed their mind. So it is shown, separately, and left
 * out of the arithmetic.
 */

type Attempts = {
  counts: { paid: number; failed: number; unsubmitted: number };
  passRate: number | null;
  floor: number;
  attempts: {
    trajHash: string; score: number; deviationMm: number; outcome: string;
  }[];
};

export function Attempts({ taskId }: { taskId: number }) {
  const [data, setData] = useState<Attempts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/attempts`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Attempts) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [taskId]);

  // Silent when the record cannot be read: a task page is still worth reading
  // without it, and an error box about a secondary statistic is worse than its
  // absence.
  if (failed) return null;
  if (!data) return <div className="hatch mt-4 h-16 max-w-[52ch]" aria-busy="true" />;

  const { paid, failed: missed, unsubmitted } = data.counts;
  const attempted = paid + missed;
  if (attempted === 0 && unsubmitted === 0) return null;

  const bars: { key: string; n: number; tone: string; label: string }[] = [
    { key: "paid", n: paid, tone: "bg-go/70", label: "paid" },
    { key: "failed", n: missed, tone: "bg-reject/70", label: "below the floor" },
    { key: "unsubmitted", n: unsubmitted, tone: "bg-scribe-3/40", label: "never submitted" },
  ].filter((b) => b.n > 0);
  const total = bars.reduce((n, b) => n + b.n, 0);

  return (
    <div className="mt-5 max-w-[52ch]">
      <div className="flex items-baseline gap-3">
        <span className="label">Attempts</span>
        {data.passRate !== null ? (
          <span className="font-mono text-[15px] tabular-nums text-scribe">
            {fmtPercent(data.passRate, 0)}{" "}
            <span className="text-[12px] text-scribe-3">
              of {fmtInt(attempted)} scored at or above {fmtScore(data.floor)}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[13px] text-scribe-3">nobody has finished a run yet</span>
        )}
      </div>

      <div className="mt-2 flex h-2 w-full overflow-hidden border border-rule" role="presentation">
        {bars.map((b) => (
          <div key={b.key} className={cn("h-full", b.tone)} style={{ width: `${(b.n / total) * 100}%` }} />
        ))}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {bars.map((b) => (
          <li key={b.key} className="flex items-baseline gap-1.5 font-mono text-[12px]">
            <span className={cn("h-2 w-2 translate-y-px", b.tone)} aria-hidden />
            <span className="tabular-nums text-scribe-2">{fmtInt(b.n)}</span>
            <span className="text-scribe-3">{b.label}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
        Every run the verifier scored, including the ones it refused to pay for.
        A run that scored well and was never signed is counted separately — it
        says something about the operator&rsquo;s evening, not about the task.
      </p>
    </div>
  );
}
