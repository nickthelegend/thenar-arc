import spec from "@/lib/arm-spec.json";
import { JERK_CEIL, JERK_FLOOR } from "@/lib/score";

/**
 * The landing page's two drawn figures, computed rather than eyeballed.
 *
 * Both make a checkable promise. The traces claim two runs differ by the ratio
 * the scoring constants actually use, and the elevation claims to be drawn to
 * scale in real millimetres. So neither is drawn by hand: the amplitudes come
 * out of lib/score.ts and the geometry out of lib/arm-spec.json, which cad/arm.py
 * writes at export time. Change a constant and the drawing changes with it.
 */

const VIEW = { w: 560, h: 300 };

/** Deterministic: the same page must not draw a different trace per render. */
function wander(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Two tool paths at the same scale: one at the jerk ceiling, one at the floor.
 *
 * The amplitudes are in the ratio JERK_CEIL / JERK_FLOOR exactly, so the visual
 * difference between the traces IS the difference between the two numbers the
 * legend quotes, not an illustration of it.
 */
export function traces() {
  const ratio = JERK_CEIL / JERK_FLOOR;
  const mid = VIEW.h / 2;
  // The held trace is drawn at a legible-but-small amplitude; the reference is
  // that amplitude times the ratio, which is what makes the comparison honest.
  const heldAmp = 10;
  const refAmp = heldAmp * ratio;

  const path = (amp: number, seed: number, terms: number) => {
    const rnd = wander(seed);
    // Summed sine terms: a few harmonics with fixed random phase, normalised so
    // the peak excursion is exactly `amp` whatever the harmonics do.
    const parts = Array.from({ length: terms }, (_, i) => ({
      k: 1.6 + i * 2.3,
      phase: rnd() * Math.PI * 2,
      w: 1 / (i + 1),
    }));
    const N = 240;
    const raw: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      raw.push(parts.reduce((a, p) => a + p.w * Math.sin(t * Math.PI * 2 * p.k + p.phase), 0));
    }
    // Normalise by the RANGE the terms actually cover, not by the sum of their
    // weights and not by their peak absolute value.
    //
    // Two earlier tries both left the figure quietly lying about the numbers
    // printed beside it. Dividing by the weight sum assumed the harmonics crest
    // together, which they do not, and gave a drawn ratio of 3.45 against a
    // claimed 3.33. Dividing by peak absolute value fixed the scale but not the
    // comparison: what a reader measures off the page is peak-to-peak, and
    // these curves are not symmetric about the midline, so two curves with the
    // same peak can cover different ranges — 3.14 against 3.33.
    //
    // Against the range, peak-to-peak comes out at exactly 2·amp for both, so
    // the ratio a reader can measure IS JERK_CEIL / JERK_FLOOR by construction.
    const lo = Math.min(...raw);
    const hi = Math.max(...raw);
    const range = hi - lo || 1;
    const centre = (hi + lo) / 2;
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * VIEW.w;
      const y = mid - ((2 * amp) / range) * (raw[i] - centre);
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return pts.join(" ");
  };

  return {
    view: VIEW,
    ratio,
    floor: JERK_FLOOR,
    ceil: JERK_CEIL,
    // The one that wanders, and the one that holds nearly flat.
    reference: path(refAmp, 20250902, 5),
    held: path(heldAmp, 7717, 3),
  };
}

/**
 * A side elevation of the link stack, strictly to scale.
 *
 * Every segment's height is its own value_mm through one shared scale factor,
 * so the drawing sums to the arm's real height and each band is honestly
 * proportioned against the others.
 */
export function elevation() {
  const links = spec.links;
  const total = links.reduce((a, l) => a + l.value_mm, 0);

  const H = 460;
  // Padding clears the first and last labels, which sat on the end rules.
  const pad = 34;
  const scale = (H - pad * 2) / total; // px per mm
  const x = 150;

  let y = H - pad;
  const bands = links.map((l) => {
    const h = l.value_mm * scale;
    const band = {
      symbol: l.symbol,
      name: l.name,
      note: l.note,
      mm: l.value_mm,
      y0: y,
      y1: y - h,
      mid: y - h / 2,
      h,
    };
    y -= h;
    return band;
  });

  return { links: bands, total, scale, x, width: 420, height: H, pad };
}

export const armSpec = spec;
