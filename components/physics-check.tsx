"use client";

import { useState } from "react";
import { DimRule } from "@/components/primitives";
import { TOLERANCE_MM } from "@/lib/score";
import { cn } from "@/lib/cn";

type Settled = {
  recorded: [number, number, number];
  physical: [number, number, number];
  divergenceMm: number;
  restHeightMm: number;
  secondsToRest: number;
  release: { at: number; pos: [number, number, number]; vel: [number, number, number] };
  engine: string;
};

/**
 * How far this recording is from what physics would have done.
 *
 * The station is a kinematic simulator and the product has always said so. The
 * question that leaves open is the one a buyer of this corpus is entitled to
 * ask — how much does that cost in fidelity? — and it has never had a number
 * attached to it. This attaches one, per run, by handing the same release
 * state to MuJoCo and integrating it to rest.
 *
 * On demand rather than on load: the engine is eight megabytes of WebAssembly
 * and the integration runs to twelve simulated seconds. Nobody should pay that
 * for a page they opened to read a score.
 */
export function PhysicsCheck({ hash }: { hash: string }) {
  const [state, setState] = useState<Settled | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/physics/${hash}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "The integration did not complete.");
      setState(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The integration did not complete.");
    } finally {
      setBusy(false);
    }
  };

  const within = state ? state.divergenceMm <= TOLERANCE_MM : false;

  return (
    <>
      <DimRule className="mt-10" note="Against physics" />
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        The station is a kinematic simulator: the payload follows the tool
        exactly and cannot topple, roll, or be nudged by what it lands on. This
        hands the same release state &mdash; where the payload was and how fast
        it was moving on the frame the jaws opened &mdash; to MuJoCo, and
        integrates it to rest. It scores nothing and changes no payout.
      </p>

      {!state ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className={cn(
              "border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
              busy ? "border-rule text-scribe-3" : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
            )}
          >
            {busy ? "Integrating…" : "Run the physics"}
          </button>
          {error ? <span className="font-mono text-[12px] text-reject">{error}</span> : null}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
            {(
              [
                ["Divergence", `${state.divergenceMm.toFixed(1)} mm`, within ? "go" : "reject"],
                ["Tolerance band", `±${TOLERANCE_MM} mm`, undefined],
                ["Rest height", `${state.restHeightMm.toFixed(1)} mm`, undefined],
                ["Settled in", `${state.secondsToRest.toFixed(2)} s`, undefined],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="flex flex-col gap-1 bg-ink-1 px-3 py-3">
                <span className="label">{label}</span>
                <span className={cn(
                  "font-mono text-[15px] tabular-nums",
                  tone === "go" ? "text-go" : tone === "reject" ? "text-reject" : "text-scribe",
                )}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
            {within
              ? `Rigid-body dynamics puts the payload ${state.divergenceMm.toFixed(1)} mm from where this recording says it stopped — inside the ±${TOLERANCE_MM} mm band the run was scored against. The kinematic path is a fair account of this one.`
              : `Rigid-body dynamics puts the payload ${state.divergenceMm.toFixed(1)} mm from where this recording says it stopped, which is outside the ±${TOLERANCE_MM} mm band. The recording and physics disagree about this run by more than its own tolerance.`}
          </p>
          <p className="mt-2 font-mono text-[12px] text-scribe-3">{state.engine}</p>
        </>
      )}
    </>
  );
}
