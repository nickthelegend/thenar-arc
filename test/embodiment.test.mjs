/**
 * The same six numbers are different poses on different arms. A recording
 * made on the SO-101 has to be read back through the SO-101's chain, by the
 * coherence check a buyer reads and by teaching, or both judge it wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { So101Chain, solveSo101, SO101 } from "../lib/so101.ts";
import { toolFor, embodimentOf } from "../lib/embodiment.ts";
import { coherenceOf } from "../lib/coherence.ts";
import { learn } from "../lib/teach.ts";

const D2R = Math.PI / 180;

/** A pick and place driven on the SO-101 exactly as the station records it. */
function so101Run() {
  const chain = new So101Chain();
  const way = [
    [0.22, 0.14, 0.12], [0.22, 0.14, 0.03], [0.22, 0.14, 0.03], [0.22, 0.14, 0.14],
    [0.16, -0.18, 0.14], [0.16, -0.18, 0.04], [0.16, -0.18, 0.04], [0.16, -0.18, 0.14],
  ];
  const grips = [42, 42, 6, 6, 6, 6, 42, 42];
  const samples = [];
  let object = [0.22, 0.14, 0];
  let t = 0;
  for (let w = 0; w < way.length - 1; w++) {
    for (let k = 0; k < 12; k++, t += 0.05) {
      const s = k / 12;
      const target = way[w].map((v, i) => v + (way[w + 1][i] - v) * s);
      solveSo101(chain, target);
      const grip = grips[w];
      const q = [...chain.q.slice(0, 5), grip / 0.9].map((d) => d * D2R);
      const tool = toolFor("so101")(q);
      if (grip <= 12 && w >= 2) object = [tool[0], tool[1], Math.max(0, tool[2] - 0.0375)];
      samples.push({ t: Number(t.toFixed(3)), q, grip, object: [...object] });
    }
  }
  return samples;
}

test("an SO-101 recording is coherent on its own arm and not on the THENAR-6", () => {
  const samples = so101Run();
  const own = coherenceOf(samples, "so101");
  const other = coherenceOf(samples, "thenar6");
  assert.equal(own.coherent, true, own.reading);
  assert.ok(own.medianMm < 10, `${own.medianMm} mm`);
  assert.equal(other.coherent, false, "read through the wrong arm, the tool is nowhere near the payload");
});

test("teaching from an SO-101 run finds its grasp and release", () => {
  const samples = so101Run();
  const out = learn(samples, "0xtest", "so101");
  assert.ok(out.skill, out.reason);
  assert.ok(Math.abs(out.skill.object[0] - 0.22) < 0.01 && Math.abs(out.skill.object[1] - 0.14) < 0.01, `grasped at ${out.skill.object}`);
  assert.ok(Math.abs(out.skill.goal[0] - 0.16) < 0.01 && Math.abs(out.skill.goal[1] + 0.18) < 0.01, `released at ${out.skill.goal}`);
});

test("the export names the arm and its joints", () => {
  assert.equal(embodimentOf("thenar6").name, "THENAR-6");
  const so = embodimentOf("so101");
  assert.match(so.name, /SO-101/);
  assert.equal(so.joints.length, 6);
  assert.equal(so.joints.length, SO101.jointNames.length);
});
