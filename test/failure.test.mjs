/** Failure classification, against the module the corpus labels with. */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "../lib/failure.ts";
import { GOAL } from "../lib/bench.ts";

function run({ seconds = 20, endsAt = GOAL, grasp = true, releaseHeight = 0 } = {}) {
  const hz = 20, n = hz * seconds, from = [0.3, 0.2], s = [];
  const graspAt = 0.25, releaseAt = 0.85;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const holding = grasp && u >= graspAt && u < releaseAt;
    let z = 0;
    if (holding) {
      const v = (u - graspAt) / (releaseAt - graspAt);
      // Come down to releaseHeight by the end of the carry.
      z = Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.18 * (1 - v) + releaseHeight * v;
    }
    s.push({
      t: +(i / hz).toFixed(3),
      grip: holding ? 6 : 42,
      object: [from[0] + (endsAt[0] - from[0]) * u, from[1] + (endsAt[1] - from[1]) * u, z],
    });
  }
  const last = s[s.length - 1];
  last.object = [endsAt[0], endsAt[1], 0];
  return s;
}

test("a run that never closed the jaws is named as that", () => {
  const f = classifyFailure(run({ grasp: false }));
  assert.equal(f.kind, "never-grasped");
});

test("letting go in mid-air is a drop, and says how high", () => {
  const f = classifyFailure(run({ releaseHeight: 0.12 }));
  assert.equal(f.kind, "dropped");
  assert.match(f.detail, /mm above the table/);
  assert.ok(typeof f.atSample === "number");
});

test("resting outside the ring is not a placement at all", () => {
  const f = classifyFailure(run({ endsAt: [GOAL[0] + 0.25, GOAL[1]] }));
  assert.equal(f.kind, "never-reached-the-ring");
});

test("inside the ring but outside the band is a miss, not a non-placement", () => {
  const f = classifyFailure(run({ endsAt: [GOAL[0] + 0.05, GOAL[1]] }));
  assert.equal(f.kind, "outside-the-band");
  assert.match(f.detail, /50\.0 mm|49\.|50\./);
});

test("a good placement is not blamed on placement", () => {
  const f = classifyFailure(run({ endsAt: [GOAL[0] + 0.004, GOAL[1]] }));
  assert.equal(f.kind, "none");
});

test("the earliest failure is the one reported", () => {
  // Never grasped AND far from the datum: the grasp is what to say.
  const f = classifyFailure(run({ grasp: false, endsAt: [GOAL[0] + 0.3, GOAL[1]] }));
  assert.equal(f.kind, "never-grasped");
});

test("a recording too short to judge says so rather than guessing", () => {
  assert.equal(classifyFailure([]).kind, "none");
  assert.equal(classifyFailure([{ t: 0, grip: 42, object: [0, 0, 0] }]).kind, "none");
});
