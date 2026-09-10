"use client";

import { useEffect, useMemo, useState } from "react";
import { GOAL, GOAL_R } from "@/lib/bench";
import { TOLERANCE_MM } from "@/lib/score";
import { fmtDate, fmtInt } from "@/lib/format";

/**
 * Where the payloads ended up, and when the task filled.
 *
 * Two things the other panels do not say. The coverage map bins whole paths,
 * so it answers where the arm has been; this bins only the resting positions,
 * which is where the task was actually judged — a corpus can wander widely and
 * still put every payload on the same square centimetre.
 *
 * And the fill history is the only view of the task as a thing that happened
 * over time rather than a total. A task that filled in an hour and a task that
 * took a fortnight look identical in every other number on the page.
 */

type Attempt = {
  trajHash: string; score: number; deviationMm: number;
  createdAt: number; outcome: "paid" | "failed" | "unsubmitted";
};

type Path = { trajHash: string; points: [number, number][]; score: number };

/** Half-width of the drawn area, in metres. The goal ring is 75 mm, so this is
 *  a close view of the datum rather than the whole table — a placement 300 mm
 *  out is a miss, not a detail worth the pixels. */
const VIEW_M = 0.16;
const SIZE = 260;

export function Filling({ taskId }: { taskId: number }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [paths, setPaths] = useState<Path[] | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`/api/task/${taskId}/attempts`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/task/${taskId}/paths`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([a, p]) => {
      if (!live) return;
      setAttempts(a?.attempts ?? []);
      setPaths(p?.paths ?? []);
    });
    return () => { live = false; };
  }, [taskId]);

  /** The last point of each accepted path: where the payload came to rest. */
  const rests = useMemo(
    () => (paths ?? []).map((p) => ({ at: p.points[p.points.length - 1], score: p.score }))
      .filter((r) => Array.isArray(r.at)),
    [paths],
  );

  /** Cumulative paid runs over time, oldest first. */
  const fill = useMemo(() => {
    const paid = (attempts ?? [])
      .filter((a) => a.outcome === "paid")
      .sort((a, b) => a.createdAt - b.createdAt);
    return paid.map((a, i) => ({ at: a.createdAt, n: i + 1 }));
  }, [attempts]);

  if (attempts === null || paths === null) {
    return <div className="hatch mt-5 h-32 max-w-[420px]" aria-busy="true" />;
  }
  if (rests.length === 0 && fill.length === 0) return null;

  const toPx = (v: number, centre: number) => ((v - centre + VIEW_M) / (VIEW_M * 2)) * SIZE;
  const span = fill.length > 1 ? fill[fill.length - 1].at - fill[0].at : 0;

  return (
    <div className="mt-6 flex flex-wrap gap-8">
      {rests.length > 0 ? (
        <div className="max-w-[260px]">
          <span className="label">Where it came to rest</span>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="mt-2 w-full border border-rule bg-ink-1"
            role="img"
            aria-label={`Resting position of ${rests.length} accepted run${rests.length === 1 ? "" : "s"}, against the datum`}
          >
            {/* The goal ring and the scoring band, so a dot has something to be
                near or far from. */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={(GOAL_R / VIEW_M) * (SIZE / 2)}
                    className="fill-none stroke-rule-strong" strokeWidth={1} />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={(TOLERANCE_MM / 1000 / VIEW_M) * (SIZE / 2)}
                    className="fill-none stroke-go" strokeWidth={1} strokeDasharray="3 3" />
            {rests.map((r, i) => (
              <circle
                key={i}
                cx={toPx(r.at[0], GOAL[0])}
                cy={SIZE - toPx(r.at[1], GOAL[1])}
                r={3.5}
                className="fill-signal"
                opacity={0.75}
              />
            ))}
          </svg>
          <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
            Every accepted run&rsquo;s final payload position. The dashed circle is
            the ±{TOLERANCE_MM} mm band, the solid one the {Math.round(GOAL_R * 1000)} mm
            goal ring. The coverage map says where the arm went; this says where
            it let go.
          </p>
        </div>
      ) : null}

      {fill.length > 1 ? (
        <div className="max-w-[260px] flex-1">
          <span className="label">How it filled</span>
          <svg
            viewBox={`0 0 ${SIZE} 90`}
            className="mt-2 w-full border border-rule bg-ink-1"
            role="img"
            aria-label={`${fill.length} runs recorded between ${fmtDate(fill[0].at)} and ${fmtDate(fill[fill.length - 1].at)}`}
          >
            <polyline
              points={fill
                .map((f) => {
                  const x = span ? ((f.at - fill[0].at) / span) * (SIZE - 16) + 8 : SIZE / 2;
                  const y = 82 - (f.n / fill[fill.length - 1].n) * 70;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ")}
              fill="none"
              className="stroke-signal"
              strokeWidth={1.5}
            />
            {fill.map((f, i) => {
              const x = span ? ((f.at - fill[0].at) / span) * (SIZE - 16) + 8 : SIZE / 2;
              const y = 82 - (f.n / fill[fill.length - 1].n) * 70;
              return <circle key={i} cx={x} cy={y} r={2.5} className="fill-signal" />;
            })}
          </svg>
          <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
            {fmtInt(fill.length)} paid run{fill.length === 1 ? "" : "s"} between{" "}
            {fmtDate(fill[0].at)} and {fmtDate(fill[fill.length - 1].at)}. Every
            other figure on this page is a total; this is the only one that says
            whether they arrived together or over weeks.
          </p>
        </div>
      ) : null}
    </div>
  );
}
