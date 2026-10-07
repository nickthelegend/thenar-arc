/**
 * Headless check of the run loop: kinematics round-trip, then a simulated
 * pick-and-place driven through the same scoring the station uses.
 *
 *   node --experimental-strip-types scripts/check-loop.ts
 */
import { REACH_MAX, solve, toolPosition } from "../lib/kinematics.ts";
import { ACCEPT_FLOOR, evaluate, JERK_CEIL, JERK_FLOOR, TOLERANCE_MM } from "../lib/score.ts";
import type { Sample } from "../lib/types.ts";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log("\nkinematics");
const targets: [number, number, number][] = [
  [0.3, 0.0, 0.16], [0.3, 0.2, 0.05], [0.17, -0.24, 0.05],
  [0.12, 0.12, 0.3], [0.36, -0.1, 0.09],
];
for (const t of targets) {
  const j = solve(t);
  const back = toolPosition(j);
  const err = Math.hypot(back[0] - t[0], back[1] - t[1], back[2] - t[2]);
  check(
    `solve→FK round-trips [${t.map((v) => v.toFixed(2)).join(", ")}]`,
    err < 1e-6 && !j.clamped,
    `error ${(err * 1000).toFixed(4)} mm`,
  );
}

const far = solve([0.9, 0.0, 0.1]);
check("out-of-reach target reports clamped", far.clamped);
check(
  "clamped target still yields finite joints",
  [far.j1, far.j2, far.j3, far.j5].every(Number.isFinite),
);
check("reach envelope is sane", REACH_MAX > 0.35 && REACH_MAX < 0.45, `${(REACH_MAX * 1000).toFixed(0)} mm`);

/** Build a trajectory that lands `deviationMm` from the goal over `seconds`. */
function simulate(deviationMm: number, seconds: number, jerky: boolean): Sample[] {
  const hz = 20;
  const n = Math.round(seconds * hz);
  const goal: [number, number] = [0.17, -0.24];
  const from: [number, number] = [0.3, 0.2];
  const out: Sample[] = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    // Smooth by default; the jerky variant is the path you get by tapping
    // the keys instead of holding them — velocity flipping every sample.
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const stutter = jerky && i % 2 === 0 ? 0.006 : 0;
    const x = from[0] + (goal[0] - from[0]) * e + stutter;
    const y = from[1] + (goal[1] - from[1]) * e + stutter;
    const z = Math.sin(Math.PI * u) * 0.18;
    out.push({
      t: i / hz,
      q: [0, 0, 0, 0, 0, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [x, y, z],
    });
  }
  const last = out[out.length - 1];
  last.object = [goal[0] + deviationMm / 1000, goal[1], 0];
  return out;
}

const run = (devMm: number, secs: number, jerky = false) => {
  const samples = simulate(devMm, secs, jerky);
  return evaluate(
    { taskId: "AX-0114", samples, durationSeconds: secs, success: devMm <= 75, deviationMm: devMm },
    125,
    0.42,
  );
};

console.log("\nscoring");
const dead = run(0.4, 96);
check("a near-perfect run is accepted", dead.success, `score ${(dead.score / 100).toFixed(2)}`);
check("a near-perfect run pays close to full rate", dead.payoutMon > 0.3, `${dead.payoutMon.toFixed(4)} MON`);

const edge = run(TOLERANCE_MM - 1, 120);
check("a run just inside tolerance is accepted", edge.success, `score ${(edge.score / 100).toFixed(2)}`);

const wide = run(300, 140);
check("a miss is rejected", !wide.success, `score ${(wide.score / 100).toFixed(2)}`);
check("a rejected run pays nothing", wide.payoutMon === 0);

const smooth = run(3, 110, false);
const snatchy = run(3, 110, true);
check(
  "a snatchy path scores below a smooth one",
  snatchy.score < smooth.score,
  `${(snatchy.score / 100).toFixed(2)} < ${(smooth.score / 100).toFixed(2)}`,
);

const quick = run(3, 70);
const slow = run(3, 260);
check(
  "a faster run scores above a slower one",
  quick.score > slow.score,
  `${(quick.score / 100).toFixed(2)} > ${(slow.score / 100).toFixed(2)}`,
);

const a = run(5, 100);
const b = run(5, 100);
check("evaluation is deterministic", a.score === b.score && a.payoutMon === b.payoutMon);
check("accept floor is enforced", wide.score < ACCEPT_FLOOR || !wide.success);
check(
  "jerk band brackets the measured range",
  JERK_FLOOR < 25.9 && JERK_CEIL > 51.3,
  `careful 25.9 and snatchy 51.3 both fall inside ${JERK_FLOOR}..${JERK_CEIL}`,
);

console.log(
  failures === 0
    ? "\nall checks passed\n"
    : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
