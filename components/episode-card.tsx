"use client";

import Link from "next/link";
import type { Preview } from "@/lib/corpus-preview";
import { fmtInt, fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import { goalFor, GOAL_R } from "@/lib/bench";
import type { TaskWithScene } from "@/components/tasks-provider";
import { cn } from "@/lib/cn";

/**
 * One episode of the corpus, as a buyer would want to see it before paying:
 * where the payload went, how the arm moved, and how it scored.
 *
 * Drawn from the run's own samples, thinned (lib/corpus-preview.ts): the path
 * from above with the carried stretch picked out and the task's goal ring
 * where the verifier scores it, and the six joints over time.
 */

export type Episode = {
  trajHash: string; taskId: number; contributor: string; score: number;
  deviationMm: number; durationSeconds: number; frames: number;
  createdAt: number; outcome: "paid" | "failed" | "unsubmitted"; txHash: string | null;
};

const TONE: Record<Episode["outcome"], string> = {
  paid: "text-go",
  failed: "text-reject",
  unsubmitted: "text-scribe-3",
};
const END: Record<Episode["outcome"], string> = {
  paid: "var(--color-go)",
  failed: "var(--color-reject)",
  unsubmitted: "var(--color-scribe-3)",
};

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const W = 240;
const H = 150;

function PathView({ p, goal, outcome }: { p: Preview; goal: readonly [number, number] | null; outcome: Episode["outcome"] }) {
  const pts = p.path;
  const xs = [...pts.map((q) => q[0]), ...(goal ? [goal[0] - GOAL_R, goal[0] + GOAL_R] : [])];
  const ys = [...pts.map((q) => q[1]), ...(goal ? [goal[1] - GOAL_R, goal[1] + GOAL_R] : [])];
  const pad = 0.02;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  // One scale for both axes, so a circle stays a circle; centred in the frame.
  const k = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const to = ([x, y]: readonly [number, number]) => [ox + (x - minX) * k, H - (oy + (y - minY) * k)] as const;
  const line = (from: number, to_: number) => pts.slice(from, to_ + 1).map((q) => to(q).map((v) => v.toFixed(1)).join(",")).join(" ");
  const [sx, sy] = to(pts[0]);
  const [ex, ey] = to(pts[pts.length - 1]);
  const g = goal ? to(goal) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full bg-ink-0" role="img"
         aria-label={`The payload's path from above${p.carried ? ", carried for part of it" : ", never lifted"}${goal ? ", with the goal ring" : ""}`}>
      {g ? <circle cx={g[0]} cy={g[1]} r={GOAL_R * k} fill="none" stroke="var(--color-rule-strong)" strokeDasharray="3 3" /> : null}
      <polyline points={line(0, pts.length - 1)} fill="none" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
      {p.carried ? <polyline points={line(p.carried[0], p.carried[1])} fill="none" stroke="var(--color-signal)" strokeWidth="2" /> : null}
      <circle cx={sx} cy={sy} r="3.5" fill="var(--color-probe)" />
      <circle cx={ex} cy={ey} r="3.5" fill={END[outcome]} />
    </svg>
  );
}

function Joints({ joints }: { joints: number[][] }) {
  const w = 240, h = 32;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-8 w-full" role="img" aria-label="The six joint angles over the run">
      {joints.map((j, i) => {
        const lo = Math.min(...j), hi = Math.max(...j);
        const span = hi - lo;
        const pts = j.map((v, x) => `${((x / Math.max(1, j.length - 1)) * w).toFixed(1)},${(span < 1e-3 ? h / 2 : h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
        return <polyline key={i} points={pts} fill="none" stroke="var(--color-probe)" strokeWidth="1" opacity={0.25 + i * 0.1} />;
      })}
    </svg>
  );
}

export function EpisodeCard({ e, preview, task }: { e: Episode; preview: Preview | null | undefined; task: TaskWithScene | undefined }) {
  const goal = task ? goalFor(task.chainName) : null;
  return (
    <li className="flex flex-col border border-rule bg-ink-1 transition-colors duration-500 hover:border-rule-strong" data-testid="episode-card">
      <Link href={`/run/${e.trajHash}`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal" aria-label={`Replay run ${shortHash(e.trajHash)} on task ${e.taskId}`}>
        {preview ? (
          <PathView p={preview} goal={goal} outcome={e.outcome} />
        ) : preview === null ? (
          <div className="flex aspect-[240/150] items-center justify-center bg-ink-0 px-4 text-center text-xs text-scribe-3">No samples stored for this run.</div>
        ) : (
          <div className="hatch aspect-[240/150]" aria-busy="true" />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-scribe-2" title={task?.name}>
            <span className="font-mono text-scribe-3">#{e.taskId}</span> {task?.name ?? ""}
          </span>
          <span className={cn("shrink-0 text-xs", TONE[e.outcome])}>{e.outcome === "unsubmitted" ? "not sent" : e.outcome}</span>
        </div>
        {preview ? <Joints joints={preview.joints} /> : <div className="h-8" />}
        <dl className="grid grid-cols-4 gap-1 font-mono text-xs tabular-nums">
          <div><dt className="font-sans text-scribe-3">Score</dt><dd className="text-scribe">{fmtScore(e.score)}</dd></div>
          <div><dt className="font-sans text-scribe-3">Time</dt><dd className="text-scribe-2">{fmtSeconds(Math.round(e.durationSeconds))}</dd></div>
          <div><dt className="font-sans text-scribe-3">Frames</dt><dd className="text-scribe-2">{fmtInt(e.frames)}</dd></div>
          <div><dt className="font-sans text-scribe-3">Lift</dt><dd className="text-scribe-2">{preview ? `${preview.liftMm} mm` : "—"}</dd></div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="min-w-0 truncate font-mono text-scribe-3" title={`${e.trajHash}, recorded ${new Date(e.createdAt).toUTCString()}`}>{shortHash(e.trajHash)} · {day(e.createdAt)}</span>
          <span className="flex shrink-0 gap-3">
            <Link href={`/run/${e.trajHash}`} className="text-signal hover:text-signal-hi">Replay</Link>
            <a href={`/api/dataset?traj=${e.trajHash}`} className="text-scribe-2 hover:text-scribe" title="This episode as a LeRobot episode, free">LeRobot</a>
          </span>
        </div>
      </div>
    </li>
  );
}
