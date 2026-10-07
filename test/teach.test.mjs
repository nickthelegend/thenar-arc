import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, toolPosition } from "../lib/kinematics.ts";
import { learn, poseAt } from "../lib/teach.ts";

// The station's grasp rule (components/station/viewport.tsx): jaws at or under
// 12 mm with the tool within 90 mm of the payload in the plane takes hold;
// opening past it lets go, and the payload drops to the table.
function simulate(drive, start, T) {
  const obj = [start[0], start[1], 0];
  let held = false;
  const samples = [];
  for (let t = 0; t <= T; t += 0.05) {
    const { target, grip } = drive(t);
    const j = solve(target);
    const tool = toolPosition(j);
    if (!held && grip <= 12 && Math.hypot(tool[0] - obj[0], tool[1] - obj[1]) < 0.09 && tool[2] < 0.13) held = true;
    if (held && grip > 12) held = false;
    if (held) (obj[0] = tool[0]), (obj[1] = tool[1]), (obj[2] = Math.max(0, tool[2] - 0.0375));
    else obj[2] = 0;
    samples.push({ t: +t.toFixed(3), q: [j.j1, j.j2, j.j3, 0, j.j5, 0], grip, object: [...obj] });
  }
  return samples;
}
function demo(start, goal) {
  const keys = [[0, [start[0], start[1], 0.16], 42], [1, [start[0], start[1], 0.05], 42], [1.5, [start[0], start[1], 0.05], 6],
    [2.2, [start[0], start[1], 0.16], 6], [3.4, [goal[0], goal[1], 0.16], 6], [4.2, [goal[0], goal[1], 0.06], 6], [4.6, [goal[0], goal[1], 0.06], 42], [5.2, [goal[0], goal[1], 0.16], 42]];
  return (t) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
    const [ta, pa, ga] = keys[i], [tb, pb, gb] = keys[i + 1];
    const k = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    return { target: pa.map((v, j) => v + (pb[j] - v) * k), grip: ga + (gb - ga) * k };
  };
}
const dev = (s, goal) => Math.hypot(s.at(-1).object[0] - goal[0], s.at(-1).object[1] - goal[1]) * 1000;

test("a run where nothing was picked up teaches nothing, and says why", () => {
  const s = simulate(() => ({ target: [0.25, 0, 0.16], grip: 42 }), [0.22, 0.14], 2);
  const out = learn(s, "x");
  assert.equal(out.skill, null);
  assert.match(out.reason, /never picked up/);
});

test("taught once on the bench, the arm repeats the task on scanned layouts", () => {
  const start = [0.22, 0.14], goal = [0.16, -0.18];
  const shown = simulate(demo(start, goal), start, 5.2);
  assert.ok(dev(shown, goal) < 25, `the demonstration itself lands (${dev(shown, goal).toFixed(1)} mm)`);
  const { skill } = learn(shown, "0xdemo");
  assert.ok(skill && skill.releaseT > skill.graspT);
  for (const [s2, g2] of [[[0.202, 0.038], [0.288, -0.066]], [[0.25, -0.1], [0.18, 0.15]]]) {
    const run = simulate((t) => poseAt(skill, t, s2, g2), s2, skill.durationS);
    assert.ok(dev(run, g2) < 25, `${s2} → ${g2}: ${dev(run, g2).toFixed(1)} mm from the goal`);
  }
});
