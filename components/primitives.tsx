"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtDeviation } from "@/lib/format";

/* -------------------------------------------------------------------------
   Measure — a label over a figure. The figure is always mono and tabular,
   because these numbers sit in columns and change in place.
   ------------------------------------------------------------------------- */

export function Measure({
  label,
  value,
  unit,
  tone = "scribe",
  size = "md",
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "scribe" | "signal" | "go" | "reject" | "probe";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const tones = {
    scribe: "text-scribe",
    signal: "text-signal",
    go: "text-go",
    reject: "text-reject",
    probe: "text-probe",
  } as const;

  const sizes = {
    sm: "text-[13px]",
    md: "text-lg",
    lg: "text-3xl",
    xl: "text-6xl sm:text-7xl",
  } as const;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="label">{label}</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums leading-none",
          sizes[size],
          tones[tone],
          size === "xl" && "tracking-[-0.03em]",
        )}
      >
        {value}
        {unit ? (
          <span
            className="ml-1 text-scribe-3"
            // Pinned rather than scaled: at the smaller figure sizes a relative
            // unit label drops under the 11px legibility floor.
            style={{ fontSize: size === "xl" ? "0.28em" : "11px" }}
          >
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   ToleranceBand — the product's one recurring diagram. A measured value
   against a nominal and two limits. Everything outside the limits is hatched,
   so a reject reads at a glance without depending on the colour.
   ------------------------------------------------------------------------- */

export function ToleranceBand({
  deviationMm,
  toleranceMm,
  label = "Placement",
}: {
  deviationMm: number;
  toleranceMm: number;
  label?: string;
}) {
  // The band shows ±2 tolerances of travel so an out-of-tolerance mark still
  // lands on the scale instead of being clipped at the edge.
  const span = toleranceMm * 2;
  const pct = 50 + (Math.max(-span, Math.min(span, deviationMm)) / span) * 50;
  const inTol = Math.abs(deviationMm) <= toleranceMm;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span
          className={cn(
            "font-mono text-[13px] tabular-nums",
            inTol ? "text-go" : "text-reject",
          )}
        >
          {fmtDeviation(deviationMm)} mm
          <span className="ml-2 text-scribe-3">±{toleranceMm}</span>
        </span>
      </div>

      <div className="relative h-7">
        {/* Out-of-tolerance regions, drawn as hatch rather than filled colour */}
        <div className="absolute inset-y-2 left-0 w-1/4 hatch border-y border-rule" />
        <div className="absolute inset-y-2 right-0 w-1/4 hatch border-y border-rule" />

        {/* The in-tolerance window */}
        <div className="absolute inset-y-2 left-1/4 right-1/4 border border-rule-strong bg-ink-1" />

        {/* Nominal — the datum the part is measured from */}
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-rule-strong" />

        {/* The measurement */}
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: `${pct}%` }}
          aria-hidden="true"
        >
          <div
            className={cn("h-full w-px", inTol ? "bg-go" : "bg-reject")}
          />
          <div
            className={cn(
              "absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rotate-45",
              inTol ? "bg-go" : "bg-reject",
            )}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   SlotTally — remaining capacity as a stack of gauge blocks, not a bar. The
   segment count is the real unit the operator plans against.
   ------------------------------------------------------------------------- */

export function SlotTally({
  filled,
  total,
  segments = 24,
}: {
  filled: number;
  total: number;
  segments?: number;
}) {
  const ratio = total > 0 ? filled / total : 0;
  const lit = Math.round(ratio * segments);

  // The blocks light in sequence rather than all at once, so a tally that has
  // just moved reads as having moved. The delay is per block and capped, so a
  // full bar still finishes inside half a second rather than crawling.
  const step = Math.min(18, 360 / Math.max(1, lit));

  return (
    <div
      className="flex h-4 items-stretch gap-px"
      role="img"
      aria-label={`${filled} of ${total} slots filled`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          style={i < lit ? { transitionDelay: `${Math.round(i * step)}ms` } : undefined}
          className={cn(
            "flex-1 transition-colors duration-300",
            i < lit ? "bg-signal" : "bg-ink-4",
            // Every fourth block is taller: a ruler needs major divisions
            i % 4 === 3 && "border-r border-ink-1",
          )}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Difficulty — filled squares out of five. Shape carries the value, so it
   survives without colour and without a legend.
   ------------------------------------------------------------------------- */

export function Difficulty({ level }: { level: number }) {
  return (
    <div
      className="flex items-center gap-[3px]"
      role="img"
      aria-label={`Difficulty ${level} of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-[7px] border",
            i < level ? "border-scribe-2 bg-scribe-2" : "border-scribe-3/50",
          )}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
   StageTrack — pre / training / post. Rank is inversion: the live stage is
   the only one printed dark on a pale ground.
   ------------------------------------------------------------------------- */

const STAGES = [
  { key: "pre", label: "PRE" },
  { key: "training", label: "TRAIN" },
  { key: "post", label: "POST" },
] as const;

export function StageTrack({ stage }: { stage: "pre" | "training" | "post" }) {
  return (
    <div className="flex items-stretch" role="img" aria-label={`Stage: ${stage}`}>
      {STAGES.map((s) => {
        const active = s.key === stage;
        return (
          <span
            key={s.key}
            className={cn(
              "border-y border-r px-2 py-1 font-mono text-[12px] font-medium tracking-[0.12em] first:border-l",
              active
                ? "border-scribe bg-scribe text-ink-0"
                : "border-rule text-scribe-3",
            )}
          >
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Controls take no colour — only rule weight, relief and inversion. Colour in
   this product always means data.
   ------------------------------------------------------------------------- */

export function Button({
  children,
  variant = "secondary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variants = {
    primary:
      "border-scribe bg-scribe text-ink-0 hover:bg-signal-hi hover:border-signal-hi",
    secondary:
      "border-rule-strong bg-ink-3 text-scribe hover:border-scribe-3 hover:bg-ink-4",
    ghost:
      "border-transparent bg-transparent text-scribe-2 hover:border-rule-strong hover:text-scribe",
  } as const;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border px-4 py-2",
        "font-mono text-[12px] font-medium uppercase tracking-[0.14em]",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-scribe-3",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* A dimension line with an optional callout, used to divide structural
   regions of a page the way a drawing divides views. */
export function DimRule({ note, className }: { note?: string; className?: string }) {
  // Both branches carry the hook. Only the noted branch used to, so every plain
  // rule on the landing page was invisible to the boot timeline that claims to
  // draw them — the selector matched nothing and GSAP warned on every load.
  if (!note) return <div data-anim="rule" className={cn("dim-rule", className)} />;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div data-anim="rule" className="dim-rule flex-1" />
      {/* Shrinkable, not fixed. `shrink-0` kept the note at its full width and
          let the rules take whatever was left, which is right until the note
          is wider than the viewport — then it runs off the edge instead, and
          on a 375 px screen "Ranked by placements, then grasps, then how close
          the misses were" lost its last four words. min-w-0 is what lets a
          flex child wrap below its content width at all. */}
      <span className="label min-w-0 shrink text-center">{note}</span>
      <div className="dim-rule flex-1" />
    </div>
  );
}

/* -------------------------------------------------------------------------
   CountUp — a figure that arrives rather than appears. Used only where a
   number is the payoff of an action; everywhere else numbers print instantly.
   ------------------------------------------------------------------------- */


function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CountUp({
  to,
  duration = 900,
  decimals = 3,
  className,
}: {
  to: number;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  // Reduced motion and a zero duration both mean "already arrived", which is
  // an initial value rather than an effect that immediately sets state.
  const [v, setV] = useState(() => (prefersReducedMotion() || duration <= 0 ? to : 0));
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) return;

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // Exponential ease-out: fast arrival, long settle, like a needle damping.
      setV(to * (1 - Math.pow(2, -10 * p)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setV(to);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
  }, [to, duration]);

  return (
    <span className={className} suppressHydrationWarning>
      {v.toFixed(decimals)}
    </span>
  );
}


/* -------------------------------------------------------------------------
   Copyable — a hash or address that can actually be taken away. Judges copy
   things; nothing here was copyable before.
   ------------------------------------------------------------------------- */

export function Copyable({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard access can be refused; the value stays selectable.
        }
      }}
      title={`Copy ${value}`}
      className={cn(
        "group inline-flex items-center gap-1.5 font-mono transition-colors",
        copied ? "text-go" : "text-scribe-3 hover:text-signal",
        className,
      )}
    >
      <span>{label ?? value}</span>
      <span aria-hidden="true" className="text-[0.85em]">
        {copied ? "copied" : "copy"}
      </span>
      <span className="sr-only">{copied ? "Copied to clipboard" : "Copy to clipboard"}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------
   Live region for transaction status. The whole submit flow was invisible to
   a screen reader before this.
   ------------------------------------------------------------------------- */

export function Announce({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message ?? ""}
    </div>
  );
}


/* -------------------------------------------------------------------------
   ScoreDial — a score that settles rather than appears.

   The verdict is the moment the run is decided, and a number that simply
   prints gives no sense of where it landed on the scale. This sweeps an arc to
   the score and lets it damp in, the way a needle does against a fixed
   graduation: the pay threshold is marked, so a run can be read as clearing it
   or falling short before the figure is parsed.
   ------------------------------------------------------------------------- */

export function ScoreDial({
  score,
  floor = 4000,
  size = 132,
}: {
  /** 0..10000, the on-chain score. */
  score: number;
  /** The score a run has to reach to be paid. */
  floor?: number;
  size?: number;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [shown, setShown] = useState(() => (reduced ? score : 0));

  useEffect(() => {
    // Reduced motion means the value is already the final one from the initial
    // state, so there is nothing to set and nothing to animate.
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      // Exponential ease-out: fast arrival, long settle.
      setShown(score * (1 - Math.pow(2, -10 * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(score);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduced]);

  // A 240-degree sweep, opening downward, so the graduation reads as an
  // instrument face rather than a progress ring.
  const SWEEP = 240;
  const START = 150;
  const r = size / 2 - 10;
  const c = size / 2;
  const polar = (frac: number, radius: number) => {
    const a = ((START + frac * SWEEP) * Math.PI) / 180;
    return [c + Math.cos(a) * radius, c + Math.sin(a) * radius];
  };
  const arc = (from: number, to: number, radius: number) => {
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    const large = (to - from) * SWEEP > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const frac = Math.max(0, Math.min(1, shown / 10000));
  const paid = score >= floor;
  const [fx, fy] = polar(floor / 10000, r);
  const [ix, iy] = polar(floor / 10000, r - 9);

  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox={`0 0 ${size} ${size * 0.78}`}
      role="img"
      aria-label={`Score ${(score / 100).toFixed(2)} out of 100, ${paid ? "above" : "below"} the ${(floor / 100).toFixed(0)} pay threshold`}
    >
      <path d={arc(0, 1, r)} fill="none" stroke="var(--color-rule)" strokeWidth="6" strokeLinecap="butt" />
      {frac > 0 ? (
        <path
          d={arc(0, frac, r)}
          fill="none"
          stroke={paid ? "var(--color-signal)" : "var(--color-reject)"}
          strokeWidth="6"
          strokeLinecap="butt"
        />
      ) : null}
      {/* The pay threshold, fixed on the face. */}
      <line x1={fx} y1={fy} x2={ix} y2={iy} stroke="var(--color-scribe-3)" strokeWidth="1.5" />
      <text
        x={c}
        y={c + 4}
        textAnchor="middle"
        className="fill-scribe font-mono"
        style={{ fontSize: 22 }}
      >
        {(shown / 100).toFixed(2)}
      </text>
      <text
        x={c}
        y={c + 22}
        textAnchor="middle"
        className="fill-scribe-3 font-mono"
        style={{ fontSize: 12 }}
      >
        / 100.00
      </text>
    </svg>
  );
}
