"use client";

import { useMemo } from "react";
import { phasesOf, type PhaseName, type Segmentable } from "@/lib/phases";

import { cn } from "@/lib/cn";

/**
 * What the run was doing, and when.
 *
 * The scrubber underneath this is a hundred and forty seconds of undivided
 * bar, and the question anybody actually has of a recording — where did it
 * pick the thing up, how long was it carrying it, where did it put it down —
 * is answerable only by dragging until the arm looks right.
 *
 * The phases are the same ones shipped in the corpus, computed by the same
 * function, so what a buyer trains on and what a reader sees here cannot
 * disagree. Clicking one seeks to it.
 */

/** Each phase reads as its own material rather than as a step on a ramp: these
 *  are different activities, not degrees of one. */
const TONE: Record<PhaseName, { bar: string; text: string; label: string }> = {
  reach:     { bar: "bg-scribe-3/25",  text: "text-scribe-3", label: "Reach" },
  grasp:     { bar: "bg-signal/70",    text: "text-signal",   label: "Grasp" },
  transport: { bar: "bg-probe/45",     text: "text-probe",    label: "Transport" },
  place:     { bar: "bg-signal/45",    text: "text-signal",   label: "Place" },
  release:   { bar: "bg-go/45",        text: "text-go",       label: "Release" },
};

export function PhaseTimeline({
  samples, cursor, onSeek,
}: {
  samples: Segmentable[];
  /** 0..1 through the recording. */
  cursor: number;
  onSeek: (u: number) => void;
}) {
  const phases = useMemo(() => phasesOf(samples), [samples]);

  if (phases.length < 2) return null;
  const total = samples.length;

  return (
    <section className="mt-6 max-w-[440px]" aria-label="Phases of this run">
      <div className="flex items-baseline justify-between">
        <span className="label">Phases</span>
        <span className="font-mono text-[12px] text-scribe-3">
          {phases.length} segments, from the samples
        </span>
      </div>

      <div className="mt-2 flex h-7 w-full overflow-hidden border border-rule">
        {phases.map((p) => {
          const width = ((p.to - p.from) / total) * 100;
          const tone = TONE[p.name];
          return (
            <button
              key={`${p.name}-${p.from}`}
              type="button"
              // Seek to the start of the phase rather than its middle: the
              // boundary is the interesting frame, and the middle of a carry
              // looks the same wherever you land in it.
              onClick={() => onSeek(Math.max(0.001, p.from / total))}
              title={`${tone.label} — ${p.seconds.toFixed(1)}s, frames ${p.from}–${p.to}`}
              aria-label={`Seek to ${tone.label}, ${p.seconds.toFixed(1)} seconds`}
              className={cn(
                "group relative h-full border-r border-rule/60 last:border-r-0",
                "transition-[filter] hover:brightness-150 focus-visible:outline-none",
                "focus-visible:brightness-150",
                tone.bar,
              )}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>

      {/* The playhead, over the bar rather than in it, so a one-frame phase is
          still clickable underneath. */}
      <div className="relative h-0">
        <div
          className="absolute -top-7 h-7 w-px bg-scribe transition-[left] duration-75"
          style={{ left: `${Math.min(100, Math.max(0, cursor * 100))}%` }}
          aria-hidden
        />
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {phases.map((p) => (
          <li key={`k-${p.name}-${p.from}`} className="flex items-baseline gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 translate-y-px", TONE[p.name].bar)} aria-hidden />
            <span className={cn("font-mono text-[12px]", TONE[p.name].text)}>{TONE[p.name].label}</span>
            <span className="font-mono text-[12px] tabular-nums text-scribe-3">
              {p.seconds.toFixed(1)}s
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
