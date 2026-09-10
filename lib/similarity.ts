import type { Segmentable } from "./phases";

/**
 * Whether two recordings are the same run twice.
 *
 * A task pays per accepted trajectory, and nothing stopped the same motion
 * being submitted again from a second address. The contract refuses a repeat
 * of the identical hash, which catches a copy-paste and nothing else: change
 * one sample by a micrometre and it is a different hash, a different signature
 * and a second payout for a recording that adds no information.
 *
 * That matters more here than it would in most places, because the product
 * being sold is variety. A buyer paying for six episodes of a task is paying
 * for six ways of doing it. Six copies of one way is a worse dataset than one
 * copy, because it also lies about how much evidence there is.
 *
 * The comparison is deliberately coarse. Two runs are the same run if the
 * payload took the same route, and the route is what survives resampling to a
 * fixed number of points — which also makes a fast run and a slow run along
 * the same path comparable, since the interesting duplicate is somebody
 * replaying a trajectory, not somebody who happened to match your timing.
 */

/** Points a path is reduced to before comparison. Enough to tell two routes
 *  apart across a 420 mm table, few enough that the comparison is arithmetic
 *  rather than a workload. */
export const SIGNATURE_POINTS = 32;

/**
 * Below this mean separation, in millimetres, two runs are the same route.
 *
 * Set from the geometry rather than from taste: the placement tolerance is
 * 25 mm, so two runs whose payloads stayed within 12 mm of each other for the
 * whole of their length were never going to be scored differently. Above it,
 * the routes genuinely differ somewhere.
 */
export const DUPLICATE_MM = 12;

/**
 * A path reduced to a fixed number of points, by arc length rather than by
 * time. Sampling by time would call a slow run and a fast run along the same
 * route different, which is the opposite of what this is for.
 */
export function pathSignature(samples: Segmentable[], points = SIGNATURE_POINTS): [number, number, number][] {
  const pts = samples.map((s) => s.object);
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: points }, () => pts[0] as [number, number, number]);

  // Cumulative arc length, so the resample is even along the path.
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1], b = pts[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = cum[cum.length - 1];

  // A path that never moved has no arc length to walk; every point is the
  // start, which is correct — that is what the recording says happened.
  if (total <= 0) return Array.from({ length: points }, () => pts[0] as [number, number, number]);

  const out: [number, number, number][] = [];
  let j = 1;
  for (let k = 0; k < points; k += 1) {
    const want = (k / (points - 1)) * total;
    while (j < cum.length - 1 && cum[j] < want) j += 1;
    const span = cum[j] - cum[j - 1];
    const u = span > 0 ? (want - cum[j - 1]) / span : 0;
    const a = pts[j - 1], b = pts[j];
    out.push([
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u,
      a[2] + (b[2] - a[2]) * u,
    ]);
  }
  return out;
}

/** Mean separation between two signatures, in millimetres. Both must have been
 *  produced with the same point count or the comparison is meaningless. */
export function signatureDistance(
  a: [number, number, number][],
  b: [number, number, number][],
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    total += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]);
  }
  return (total / n) * 1000;
}

/** How far this run is from the nearest run already on file, and which one
 *  that was. Null when there is nothing to compare against. */
export function nearestNeighbour(
  candidate: Segmentable[],
  existing: { hash: string; samples: Segmentable[] }[],
): { hash: string; distanceMm: number } | null {
  if (existing.length === 0) return null;
  const sig = pathSignature(candidate);
  let best: { hash: string; distanceMm: number } | null = null;
  for (const e of existing) {
    const d = signatureDistance(sig, pathSignature(e.samples));
    if (!best || d < best.distanceMm) best = { hash: e.hash, distanceMm: d };
  }
  return best;
}

/**
 * How different a corpus's runs are from each other, in millimetres.
 *
 * The mean separation between every pair of paths. Duplicate rejection sets a
 * floor under this — nothing within 12 mm of an existing run gets in — but a
 * corpus can clear that floor and still be six runs down one corridor, all
 * 15 mm apart. Coverage answers "where has this been"; this answers "how
 * different are the ways of doing it", and the two come apart: a corpus can
 * cover a wide area with one route through it.
 *
 * Reported rather than scored. There is no threshold here for what counts as
 * enough, because that depends on what a buyer is training and this system is
 * in no position to decide it for them.
 */
export function diversityMm(runs: { samples: Segmentable[] }[]): number | null {
  if (runs.length < 2) return null;
  const sigs = runs.map((r) => pathSignature(r.samples));
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sigs.length; i += 1) {
    for (let j = i + 1; j < sigs.length; j += 1) {
      total += signatureDistance(sigs[i], sigs[j]);
      pairs += 1;
    }
  }
  return pairs ? total / pairs : null;
}
