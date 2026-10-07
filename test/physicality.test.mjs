/**
 * A score is only signed for a recording in which the arm moved the payload.
 *
 * Before this, a script that glided the payload onto the goal while the
 * joints sat at zero scored 100.00 and would have been paid in full; the
 * coherence check that knew it was fake only ran when the corpus was exported.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { physicalityOf } from "../lib/coherence.ts";
import { GOAL, START, ARM_B_BASE, startPoses } from "../lib/bench.ts";
import { solve, solveAt, toolPositionAt } from "../lib/kinematics.ts";
import { So101Chain, solveSo101 } from "../lib/so101.ts";
import { toolFor } from "../lib/embodiment.ts";
import { evaluate } from "../lib/score.ts";

const D2R = Math.PI / 180;
const lerp = (a, b, s) => a.map((v, i) => v + (b[i] - v) * s);

/** Drive an arm through waypoints the way the station does: the payload is
 *  picked up when the jaws close over it and follows the tool until they open. */
function drive({ ik, fk, start = START, goal = GOAL }) {
  const way = [
    [start[0], start[1], 0.14], [start[0], start[1], 0.04], [start[0], start[1], 0.04],
    [start[0], start[1], 0.14], [goal[0], goal[1], 0.14], [goal[0], goal[1], 0.05],
    [goal[0], goal[1], 0.05], [goal[0], goal[1], 0.14],
  ];
  const grips = [42, 42, 6, 6, 6, 6, 42, 42];
  let object = [start[0], start[1], 0], held = false, t = 0;
  const samples = [];
  for (let w = 0; w < way.length - 1; w++) {
    for (let k = 0; k < 10; k++, t += 0.05) {
      const q = ik(lerp(way[w], way[w + 1], k / 10), grips[w]);
      const tool = fk(q);
      if (!held && grips[w] <= 12 && Math.hypot(tool[0] - object[0], tool[1] - object[1]) < 0.09) held = true;
      if (held && grips[w] > 12) held = false;
      if (held) object = [tool[0], tool[1], Math.max(0, tool[2] - 0.0375)];
      else if (object[2] > 0) object = [object[0], object[1], Math.max(0, object[2] - 0.045)];
      samples.push({ t: Number(t.toFixed(3)), q, grip: grips[w], object: [...object] });
    }
  }
  return samples;
}

const thenar6 = () => drive({
  ik: (p) => { const j = solve(p); return [j.j1, j.j2, j.j3, 0, j.j5, 0]; },
  fk: toolFor("thenar6"),
});

test("the scripted run that scored 100.00 is refused", () => {
  const samples = [];
  for (let i = 0; i < 120; i++) {
    const s = Math.min(1, Math.max(0, (i - 20) / 60)), e = s * s * (3 - 2 * s);
    samples.push({ t: +(i * 0.05).toFixed(3), q: [0, 0, 0, 0, 0, 0], grip: i >= 20 && i < 82 ? 6 : 42,
      object: [START[0] + (GOAL[0] - START[0]) * e, START[1] + (GOAL[1] - START[1]) * e, 0] });
  }
  assert.equal(evaluate({ samples, durationSeconds: 6, deviationMm: 0, success: true }, 60, 1).score, 10000,
    "the scorer alone still calls it perfect, which is why the check has to run before signing");
  assert.match(physicalityOf(samples, { arm: "thenar6", start: START }), /did not move it/);
});

test("a run that begins with the payload already on the goal is refused", () => {
  const samples = thenar6().map((s) => ({ ...s, object: [GOAL[0], GOAL[1], 0] }));
  assert.match(physicalityOf(samples, { arm: "thenar6", start: START }), /begins \d+ mm from where this task puts it/);
});

test("a run the THENAR-6 really drove passes", () => {
  const samples = thenar6();
  assert.equal(physicalityOf(samples, { arm: "thenar6", start: START }), null);
  assert.ok(evaluate({ samples, durationSeconds: 2, deviationMm: 0, success: true }, 60, 1).score > 4000);
});

test("a scanned task's run starts at its scanned position", () => {
  const start = [0.199, 0.035], goal = [0.309, -0.052];
  const samples = drive({ start, goal, ik: (p) => { const j = solve(p); return [j.j1, j.j2, j.j3, 0, j.j5, 0]; }, fk: toolFor("thenar6") });
  assert.equal(physicalityOf(samples, { arm: "thenar6", start }), null);
  assert.match(physicalityOf(samples, { arm: "thenar6", start: START }), /begins/);
});

test("an SO-101 run passes on the SO-101 and is refused when read as a THENAR-6", () => {
  const chain = new So101Chain();
  const samples = drive({
    ik: (p, grip) => { solveSo101(chain, p); return [...chain.q.slice(0, 5), grip / 0.9].map((d) => d * D2R); },
    fk: toolFor("so101"),
  });
  assert.equal(physicalityOf(samples, { arm: "so101", start: START }), null);
  assert.match(physicalityOf(samples, { arm: "thenar6", start: START }), /did not move it/);
});

test("in a two-arm scene, the second arm carrying the second payload counts", () => {
  const [p0, p1] = startPoses(START, 2);
  const one = drive({ start: p1, goal: GOAL, ik: (p) => { const j = solveAt(ARM_B_BASE, p); return [j.j1, j.j2, j.j3, 0, j.j5, 0]; },
    fk: (q) => toolPositionAt(ARM_B_BASE, { j1: q[0], j2: q[1], j3: q[2], j5: q[4], clamped: false }) });
  const rest = solve([0.3, 0, 0.16]);
  const samples = one.map((s) => ({
    t: s.t, q: [rest.j1, rest.j2, rest.j3, 0, rest.j5, 0], grip: 42,
    object: [p0[0], p0[1], 0], object2: s.object, q2: s.q, grip2: s.grip,
  }));
  assert.equal(physicalityOf(samples, { arm: "thenar6", start: START }), null);
});
