"use client";

import { GOAL_R, SEAT_OFFSET } from "@/lib/bench";
import { TOLERANCE_MM } from "@/lib/score";

/**
 * The tolerance, drawn at the size it actually is.
 *
 * Every surface states the band in millimetres — ±25 mm, inside a 75 mm ring —
 * and a number in millimetres tells nobody whether that is a generous target or
 * a hard one. It is hard: the payload this task moves is wider than the band it
 * has to land in, so the object cannot be centred by eye and the operator is
 * aiming at something smaller than the thing in the jaws.
 *
 * Drawn from `lib/bench.ts` and `lib/score.ts` rather than from numbers typed
 * here, so a change to the datum moves this picture with it. One millimetre is
 * one unit of the viewBox and the whole figure is scaled by CSS, which is what
 * keeps the three circles in true proportion at any width.
 */
export function DatumScale({
  payloadMm,
  payloadLabel,
  seats,
  className,
}: {
  /** Width of the object being placed, in millimetres. */
  payloadMm: number;
  payloadLabel: string;
  /** How many objects come to rest here. Two are seated either side of centre. */
  seats: number;
  className?: string;
}) {
  const ringMm = GOAL_R * 1000;
  const offsetMm = SEAT_OFFSET * 1000;
  // Room for the ring, plus the further seat and its payload, plus the labels.
  const half = ringMm + 26;

  const seatXs = seats < 2 ? [0] : [-offsetMm, offsetMm];

  return (
    <figure className={className}>
      <svg
        viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
        className="w-full max-w-[380px]"
        role="img"
        aria-label={`The ${Math.round(ringMm)} millimetre goal ring, the ${TOLERANCE_MM} millimetre tolerance band, and the ${Math.round(payloadMm)} millimetre ${payloadLabel}, drawn to the same scale`}
      >
        {/* The goal ring: outside it the payload was not placed at all, which is
            a different statement from placed badly. */}
        <circle cx="0" cy="0" r={ringMm} fill="none" stroke="var(--color-rule-strong)"
                strokeWidth="0.8" strokeDasharray="4 3" />

        {seatXs.map((x, i) => (
          <g key={i}>
            {/* The band that pays. */}
            <circle cx={x} cy="0" r={TOLERANCE_MM} fill="var(--color-signal-dim)"
                    stroke="var(--color-signal)" strokeWidth="0.8" />
            {/* The object, at its own width, over the seat it has to reach. */}
            <circle cx={x} cy="0" r={payloadMm / 2} fill="none"
                    stroke="var(--color-scribe-2)" strokeWidth="0.8" strokeDasharray="2 2" />
            <circle cx={x} cy="0" r="1.1" fill="var(--color-signal)" />
          </g>
        ))}

        {/* A dimension line across the band, terminated like a drawing. */}
        <g stroke="var(--color-scribe-3)" strokeWidth="0.6">
          <line x1={seatXs[0] - TOLERANCE_MM} y1={ringMm * 0.62} x2={seatXs[0] + TOLERANCE_MM} y2={ringMm * 0.62} />
          <line x1={seatXs[0] - TOLERANCE_MM} y1={ringMm * 0.62 - 3} x2={seatXs[0] - TOLERANCE_MM} y2={ringMm * 0.62 + 3} />
          <line x1={seatXs[0] + TOLERANCE_MM} y1={ringMm * 0.62 - 3} x2={seatXs[0] + TOLERANCE_MM} y2={ringMm * 0.62 + 3} />
        </g>
        <text x={seatXs[0]} y={ringMm * 0.62 - 5} textAnchor="middle"
              fill="var(--color-scribe-3)" fontSize="7"
              fontFamily="var(--font-mono)">±{TOLERANCE_MM} mm</text>

        <text x="0" y={-ringMm - 4} textAnchor="middle"
              fill="var(--color-scribe-3)" fontSize="7"
              fontFamily="var(--font-mono)">{Math.round(ringMm)} mm ring</text>
      </svg>

      <figcaption className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-scribe-3">
        To scale. The {payloadLabel.toLowerCase()} is {Math.round(payloadMm)} mm across and
        has to come to rest inside {TOLERANCE_MM} mm of its seat &mdash;{" "}
        {payloadMm / 2 > TOLERANCE_MM
          ? "wider than the band it is aiming at, so it cannot be centred by eye"
          : "narrow enough to sit inside the band, which is the easier half of this bench"}
        . Outside the {Math.round(ringMm)} mm ring it counts as not placed at all.
      </figcaption>
    </figure>
  );
}
