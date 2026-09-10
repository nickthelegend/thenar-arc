"use client";

import { useEffect, useMemo, useState } from "react";
import { REACH_MAX, REACH_MIN } from "@/lib/kinematics";
import { GOAL } from "@/lib/bench";
import { fmtPercent } from "@/lib/format";

/**
 * How much of the workspace this corpus has actually been in.
 *
 * The score distribution says how well the runs went and the path overlay says
 * what route they took. Neither answers the question a buyer has before
 * training on it: does this corpus cover the arm's working area, or is it
 * fifty runs down the same corridor?
 *
 * That is not a stylistic concern. A policy learns the states it was shown, so
 * a corpus concentrated in one band produces something that works in that band
 * and falls over beside it, and the number that predicts it is coverage rather
 * than mean score. A task can have a mean of 94 and cover a tenth of the
 * table.
 *
 * The denominator is the reachable annulus, not the table: the arm cannot get
 * closer than REACH_MIN or further than REACH_MAX, so counting the corners it
 * physically cannot visit would report every corpus as sparse and say nothing
 * about any of them.
 */

/** Cell size in metres. 30 mm is close to the payload's own width, so a cell is
 *  about "somewhere the payload has been" rather than a pixel. */
const CELL = 0.03;
const EXTENT = 0.42; // the table half-width, in metres

type Paths = { paths: { points: [number, number][]; score: number }[] };

export function Coverage({ taskId }: { taskId: number }) {
  const [data, setData] = useState<Paths | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/paths`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Paths) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [taskId]);

  const grid = useMemo(() => {
    if (!data?.paths?.length) return null;
    const n = Math.ceil((EXTENT * 2) / CELL);
    const toIndex = (v: number) => Math.floor((v + EXTENT) / CELL);

    const reachable: boolean[] = new Array(n * n).fill(false);
    const visited: number[] = new Array(n * n).fill(0);

    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        // The centre of the cell, in metres, measured from the arm's base.
        const x = -EXTENT + (ix + 0.5) * CELL;
        const y = -EXTENT + (iy + 0.5) * CELL;
        const d = Math.hypot(x, y);
        reachable[iy * n + ix] = d >= REACH_MIN && d <= REACH_MAX;
      }
    }

    for (const p of data.paths) {
      for (const [x, y] of p.points) {
        const ix = toIndex(x), iy = toIndex(y);
        if (ix < 0 || iy < 0 || ix >= n || iy >= n) continue;
        visited[iy * n + ix] += 1;
      }
    }

    let reach = 0, seen = 0, busiest = 0;
    for (let i = 0; i < reachable.length; i += 1) {
      if (!reachable[i]) continue;
      reach += 1;
      if (visited[i] > 0) seen += 1;
      busiest = Math.max(busiest, visited[i]);
    }

    return { n, reachable, visited, fraction: reach ? seen / reach : 0, busiest, cells: seen, reach };
  }, [data]);

  if (failed) return null;
  if (!grid) return <div className="hatch mt-4 h-40 max-w-[420px]" aria-busy="true" />;

  const { n, reachable, visited, fraction, busiest } = grid;
  const px = 420 / n;

  return (
    <div className="mt-5 max-w-[420px]">
      <div className="flex items-baseline justify-between">
        <span className="label">Workspace covered</span>
        <span className="font-mono text-[15px] tabular-nums text-scribe">
          {fmtPercent(fraction, 0)}
        </span>
      </div>

      <svg
        viewBox={`0 0 420 420`}
        className="mt-2 w-full border border-rule bg-ink-1"
        role="img"
        aria-label={`${fmtPercent(fraction, 0)} of the arm's reachable area has been visited by this task's runs`}
      >
        {Array.from({ length: n * n }, (_, i) => {
          if (!reachable[i]) return null;
          const ix = i % n, iy = Math.floor(i / n);
          const v = visited[i];
          // Screen y grows downward; the table's y grows away from the camera.
          const x = ix * px, y = 420 - (iy + 1) * px;
          if (v === 0) {
            return <rect key={i} x={x} y={y} width={px} height={px} className="fill-scribe-3/[0.07]" />;
          }
          const heat = 0.25 + 0.75 * Math.min(1, v / Math.max(1, busiest));
          return (
            <rect key={i} x={x} y={y} width={px} height={px}
                  className="fill-signal" opacity={heat} />
          );
        })}
        {/* The datum, so the map has a landmark that is not a statistic. */}
        <circle
          cx={((GOAL[0] + EXTENT) / (EXTENT * 2)) * 420}
          cy={420 - ((GOAL[1] + EXTENT) / (EXTENT * 2)) * 420}
          r={5}
          className="fill-none stroke-go"
          strokeWidth={1.5}
        />
      </svg>

      <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
        Every accepted run&rsquo;s payload path, binned into {Math.round(CELL * 1000)} mm cells
        over the area the arm can actually reach. Unlit cells are places this
        corpus has never been — a policy trained on it has not seen them either.
        The ring is the datum.
      </p>
    </div>
  );
}
