"use client";

import { useEffect, useState } from "react";
import { pickBest, type RunRow } from "@/lib/race";
import { fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import type { Race } from "@/components/station/race-ghost";
import { cn } from "@/lib/cn";

/**
 * Race the task's best paid run: the switch, the run it loads, and how the
 * operator is doing against it.
 *
 * The run is read from the ledger (the best score this task has paid for) and
 * its samples from the same endpoint /run replays, so the ghost is the
 * recording a buyer would get.
 */

type State = { for: number; race: Race | null; note: string | null };

export function useBestRun(taskId: number, enabled: boolean) {
  const [s, setS] = useState<State | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/task/${taskId}/runs`);
        if (!response.ok) throw new Error("Run ledger unavailable");
        const r = await response.json() as { runs?: RunRow[] };
        const best = pickBest(r.runs ?? []);
        if (!best) { if (live) setS({ for: taskId, race: null, note: "No paid run on this task yet: be the first, and the next operator races you." }); return; }
        const trajectory = await fetch(`/api/trajectory/${best.traj_hash}`);
        if (!trajectory.ok) throw new Error("Recording unavailable");
        const t = await trajectory.json() as { samples?: Race["samples"] };
        const samples = t.samples ?? [];
        if (!samples.length || !samples[0].q) { if (live) setS({ for: taskId, race: null, note: "The best run's samples could not be read." }); return; }
        if (live) setS({ for: taskId, note: null, race: { hash: best.traj_hash, score: best.score, seconds: samples[samples.length - 1].t - samples[0].t, samples } });
      } catch {
        if (live) setS({ for: taskId, race: null, note: "The best run could not be read." });
      }
    })();
    return () => { live = false; };
  }, [taskId, enabled]);
  return enabled && s?.for === taskId ? s : null;
}

export function RacePanel({
  on, onToggle, best, elapsed, running, measuredSeconds,
}: {
  on: boolean;
  onToggle: () => void;
  best: State | null;
  elapsed: number;
  running: boolean;
  measuredSeconds: number | null;
}) {
  const race = best?.race ?? null;
  return (
    <div className="flex flex-col gap-2" data-testid="race-panel">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
          on ? "border-signal/50 bg-signal-dim text-signal-hi" : "border-white/10 text-scribe-2 hover:border-white/25 hover:text-white",
        )}
      >
        <span>Race the best run</span>
        <span className="font-mono">{on ? "on" : "off"}</span>
      </button>
      {on ? (
        <p className="text-xs leading-relaxed text-scribe-3" data-testid="race-status">
          {!best ? "Reading the best run…"
            : !race ? best.note
            : measuredSeconds !== null
              ? <>You took <span className="text-scribe">{fmtSeconds(measuredSeconds)}</span>; the best run took <span className="text-signal">{fmtSeconds(race.seconds)}</span> and scored {fmtScore(race.score)}.</>
              : running
                ? <>The ghost is at <span className="text-signal">{fmtSeconds(Math.min(elapsed, race.seconds))}</span> of {fmtSeconds(race.seconds)}{elapsed > race.seconds ? ", finished" : ""}.</>
                : <>The translucent arm is run {shortHash(race.hash)}, the best this task has paid for: {fmtScore(race.score)} in {fmtSeconds(race.seconds)}. It starts when you begin.</>}
        </p>
      ) : null}
    </div>
  );
}
