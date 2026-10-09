/**
 * A recorded pick-and-place for scripts and tests: the joint angles are solved
 * from the payload's path with the station's own solver, so the arm and the
 * payload describe one event and the verifier's physicality checks pass. The
 * payload starts where the station puts it for a task with no scanned scene.
 */
import { solve, toolPosition } from "../lib/kinematics.ts";
import { GOAL, START } from "../lib/bench.ts";

/** From lib/coherence.ts: jaws below this opening are holding something, in mm. */
export const GRIP_CLOSED_MM = 14;
/** From lib/coherence.ts: a held payload further than this from the tool is not held. */
export const COHERENT_MM = 60;

/**
 * A pick-and-place the arm actually performs.
 *
 * The joint angles are solved from the payload's position at every frame with
 * the station's own solver, so while the jaws are closed the tool is where the
 * payload is and the recording's two columns describe one event. The seed
 * offsets the start, the lift and the pace, so no two seeds share a route and a
 * second run on a task is not refused as a copy of the first.
 */
export function makeRun(seed) {
  const rnd = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const hz = 20;
  const secs = 60 + Math.round(rnd(1) * 35);
  const dev = 2.5 + rnd(2) * 4;
  const n = hz * secs;
  // Kept inside the arm's reach at every lift, so the solver never has to clamp.
  // Where the station puts the payload for a task with no scanned scene, give or take 5 mm, and its goal.
  const from = [START[0] + (rnd(3) - 0.5) * 0.01, START[1] + (rnd(4) - 0.5) * 0.01];
  const goal = [GOAL[0], GOAL[1]];
  const lift = 0.12 + rnd(5) * 0.1;
  const samples = [];
  let clamped = 0;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const object = [from[0] + (goal[0] - from[0]) * e, from[1] + (goal[1] - from[1]) * e, Math.sin(Math.PI * u) * lift];
    const j = solve(object);
    if (j.clamped) clamped += 1;
    samples.push({
      t: Number((i / hz).toFixed(3)),
      q: [j.j1, j.j2, j.j3, 0, j.j5, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object,
    });
  }
  samples[samples.length - 1].object = [goal[0] + dev / 1000, goal[1], 0];
  return { run: { samples, durationSeconds: secs, deviationMm: Number(dev.toFixed(2)), success: true }, clamped };
}

/** The corpus's coherence measurement, repeated here so an incoherent run is never sent. */
export function heldDistanceMm(samples) {
  const d = samples
    .filter((s) => s.grip <= GRIP_CLOSED_MM)
    .map((s) => {
      const t = toolPosition({ j1: s.q[0], j2: s.q[1], j3: s.q[2], j5: s.q[4], clamped: false });
      return Math.hypot(t[0] - s.object[0], t[1] - s.object[1]);
    })
    .sort((a, b) => a - b);
  return d[d.length >> 1] * 1000;
}

