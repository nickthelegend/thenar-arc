import { test } from "node:test";
import assert from "node:assert/strict";
import { So101Chain, solveSo101, so101Tool, SO101 } from "../lib/so101.ts";

test("the SO-101 chain comes from the CAD: six joints, a gripping point ahead of the base", () => {
  const c = new So101Chain();
  assert.equal(c.joints.length, 6);
  const home = so101Tool(SO101.homeDeg.map((d) => (d * Math.PI) / 180));
  assert.ok(home[0] > 0.25 && home[0] < 0.4 && Math.abs(home[1]) < 0.01, `home TCP ${home}`);
});

test("gripper-down reach covers the station's bench, including a scanned layout", () => {
  const c = new So101Chain();
  for (const p of [[0.22, 0.14, 0.05], [0.16, -0.18, 0.06], [0.288, -0.066, 0.03], [0.3, 0, 0.16], [0.2, 0.038, 0.03]]) {
    let err = Infinity;
    for (let f = 0; f < 6 && err > 3; f++) err = solveSo101(c, p);
    const at = so101Tool(c.q.slice(0, 5).map((d) => (d * Math.PI) / 180));
    assert.ok(err < 6, `${p}: ${err.toFixed(1)} mm off`);
    assert.ok(Math.hypot(at[0] - p[0], at[1] - p[1], at[2] - p[2]) * 1000 < 6);
  }
});

test("joints stay inside the manifest's limits", () => {
  const c = new So101Chain();
  const q = c.set([999, -999, 0, 0, 0, 999]);
  assert.deepEqual([q[0], q[1], q[5]], [SO101.limitsDeg[0][1], SO101.limitsDeg[1][0], SO101.limitsDeg[5][1]]);
});
