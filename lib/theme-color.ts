/**
 * The product's palette, for consumers that cannot use CSS.
 *
 * SVG in the DOM can write `stroke="var(--color-signal)"` and be done. A
 * Three.js material cannot: it needs a real colour, and there is no cascade
 * inside a WebGL scene. The tempting fix is a second table of hexes in
 * TypeScript, which is exactly how a codebase ends up with a palette that has
 * been changed in one place and not the other — this project had thirty
 * literals of a discarded accent still rendering months after it was replaced,
 * in ghost trails, score dials and a PWA theme colour, because each of them was
 * its own copy.
 *
 * So there is no second table. The value is read from the same custom property
 * the stylesheet defines, at the moment it is needed, which means these
 * surfaces also follow the light/dark switch for free.
 */

/** Read one of the product's colour tokens. Client-side only. */
export function themeColor(token: string, fallback = "#000000"): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
}

/** The tokens a 3D scene reaches for, named so a call site reads as intent. */
export const sceneColor = {
  signal: () => themeColor("--color-signal", "#2B50E0"),
  signalHi: () => themeColor("--color-signal-hi", "#1B3CB8"),
  go: () => themeColor("--color-go", "#0B6B41"),
  reject: () => themeColor("--color-reject", "#B60D33"),
  probe: () => themeColor("--color-probe", "#3A5578"),
  rule: () => themeColor("--color-rule", "#D6D6D4"),
  ruleStrong: () => themeColor("--color-rule-strong", "#B2B2AE"),
  scribe3: () => themeColor("--color-scribe-3", "#5A5B62"),
};
