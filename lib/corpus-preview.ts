import type { Sample } from "./types";

/**
 * What an episode looks like, small enough to show forty of them at once.
 *
 * A buyer deciding whether a corpus is worth anything wants to see the
 * episodes, not read their hashes. A whole recording is tens of kilobytes; a
 * preview is the same samples thinned to a fixed number of points, with the
 * first and the last always kept, so the path on the card starts and ends
 * where the run did, to a tenth of a millimetre. Nothing is smoothed or
 * invented: every point is a sample the hash is derived from.
 */

export type Preview = {
  /** Samples in the recording. */
  frames: number;
  seconds: number;
  /** The payload's path seen from above, metres: [x, y] per kept sample. */
  path: [number, number][];
  /** The stretch of `path` where the payload was off the table, as indices, or null if it never was. */
  carried: [number, number] | null;
  /** Each of the six joints over the kept samples, radians. */
  joints: number[][];
  /** How far the payload was lifted above where it started, mm. */
  liftMm: number;
};

/** Above this the payload counts as lifted, metres: clear of contact noise. */
export const LIFTED_M = 0.005;
export const PREVIEW_POINTS = 48;

/** Indices of at most `max` samples out of `n`, evenly spread, both ends kept. */
export function thin(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (n - 1)) / (max - 1));
    if (out[out.length - 1] !== i) out.push(i);
  }
  return out;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;

export function previewOf(samples: Sample[], points = PREVIEW_POINTS): Preview | null {
  if (!samples.length) return null;
  const keep = thin(samples.length, points);
  const z0 = samples[0].object[2];
  let lift = 0;
  for (const s of samples) lift = Math.max(lift, s.object[2] - z0);
  const kept = keep.map((i) => samples[i]);
  const up = kept.map((s) => s.object[2] - z0 > LIFTED_M);
  const first = up.indexOf(true);
  const last = up.lastIndexOf(true);
  return {
    frames: samples.length,
    seconds: r3(samples[samples.length - 1].t - samples[0].t),
    path: kept.map((s) => [r4(s.object[0]), r4(s.object[1])]),
    carried: first === -1 ? null : [first, last],
    joints: Array.from({ length: 6 }, (_, j) => kept.map((s) => r3(s.q?.[j] ?? 0))),
    liftMm: Math.round(lift * 1000),
  };
}
