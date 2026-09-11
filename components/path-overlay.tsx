"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import { GOAL_R } from "@/components/station/viewport";
import { cn } from "@/lib/cn";
import { fmtScore, shortHash } from "@/lib/format";

type Path = { trajHash: string; contributor: string; score: number; points: [number, number][] };

/**
 * Every accepted approach to this task, drawn on one plate.
 *
 * The histogram says how well people did; this says how. Whether the good runs
 * share a route or there are two equally good ones, whether the poor runs
 * wander — none of that is visible in a distribution, and it is exactly what
 * someone deciding whether a corpus is worth licensing needs to see.
 *
 * The best run is drawn last and brightest, the rest recede by score. Hovering
 * a row lifts its path out of the bundle.
 */
export function PathOverlay({ taskId, goal }: { taskId: number; goal: [number, number] }) {
  const [paths, setPaths] = useState<Path[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/paths`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { paths: Path[] }) => { if (live) setPaths(d.paths); })
      .catch(() => { if (live) setPaths([]); });
    return () => { live = false; };
  }, [taskId]);

  // One frame for every path, sized from the paths themselves plus the datum,
  // so nothing is cropped and the goal is always in view.
  const frame = useMemo(() => {
    if (!paths?.length) return null;
    const all = paths.flatMap((p) => p.points);
    const xs = [...all.map((p) => p[0]), goal[0] - GOAL_R, goal[0] + GOAL_R];
    const ys = [...all.map((p) => p[1]), goal[1] - GOAL_R, goal[1] + GOAL_R];
    const pad = 0.03;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const to = ([x, y]: [number, number]): [number, number] => [
      ((x - minX) / span) * 300,
      300 - ((y - minY) / span) * 300,
    ];
    return { to, r: (GOAL_R / span) * 300 };
  }, [paths, goal]);

  if (paths !== null && paths.length === 0) return null;

  return (
    <div className="mt-5 flex flex-col gap-4 sm:flex-row">
      <svg
        viewBox="0 0 300 300"
        className="w-full max-w-[340px] shrink-0 border border-rule bg-ink-0"
        role="img"
        aria-label={`Tool paths of ${paths?.length ?? 0} accepted runs on this task`}
      >
        {frame ? (
          <>
            <circle cx={frame.to(goal)[0]} cy={frame.to(goal)[1]} r={frame.r}
                    fill="none" stroke="var(--color-signal)" strokeWidth="1" />
            {paths!.map((p, i) => {
              const best = i === 0;
              const on = hover === p.trajHash;
              return (
                <polyline
                  key={p.trajHash}
                  points={p.points.map((pt) => frame.to(pt).map((n) => n.toFixed(1)).join(",")).join(" ")}
                  fill="none"
                  stroke={on ? "var(--color-signal-hi)" : best ? "var(--color-signal)" : "var(--color-probe)"}
                  strokeWidth={on ? 2.4 : best ? 1.8 : 1}
                  opacity={on ? 1 : best ? 0.95 : 0.34}
                />
              );
            })}
          </>
        ) : null}
      </svg>

      <ol className="min-w-0 flex-1">
        {(paths ?? []).map((p, i) => (
          <li
            key={p.trajHash}
            onMouseEnter={() => setHover(p.trajHash)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              "flex items-baseline justify-between gap-3 border-b border-rule py-2",
              hover === p.trajHash && "bg-signal-dim",
            )}
          >
            <Link
              href={`/run/${p.trajHash}`}
              className="truncate font-mono text-[12px] text-scribe-3 hover:text-probe"
            >
              {i === 0 ? <span className="text-signal">best </span> : null}
              {shortHash(p.contributor)}
            </Link>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-scribe-2">
              {fmtScore(p.score)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
