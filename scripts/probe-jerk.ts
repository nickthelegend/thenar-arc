import { meanJerk } from "../lib/score.ts";
import type { Sample } from "../lib/types.ts";

/** Paths at 20 Hz, as the recorder produces them. */
function path(kind: "smooth" | "keyboard" | "snatchy", secs = 100): Sample[] {
  const hz = 20, n = Math.round(secs * hz);
  const out: Sample[] = [];
  let x = 0.3, y = 0.2;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    if (kind === "smooth") {
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      x = 0.3 + (0.17 - 0.3) * e;
      y = 0.2 + (-0.24 - 0.2) * e;
    } else if (kind === "keyboard") {
      // Held key: constant velocity with start/stop every ~1.5 s.
      const on = Math.floor(u * 14) % 2 === 0;
      if (on) { x -= 0.0009; y -= 0.0031; }
    } else {
      // Tapping: velocity flips every other sample.
      const on = i % 2 === 0;
      if (on) { x -= 0.0018; y -= 0.0062; }
    }
    out.push({ t: i / hz, q: [0, 0, 0, 0, 0, 0], grip: 6, object: [x, y, Math.sin(Math.PI * u) * 0.18] });
  }
  return out;
}

for (const k of ["smooth", "keyboard", "snatchy"] as const) {
  console.log(`${k.padEnd(10)} meanJerk = ${meanJerk(path(k)).toFixed(2)} m/s^3`);
}
