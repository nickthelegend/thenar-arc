/**
 * Phase segmentation, against the module the corpus is built from.
 *
 *     npm run test:unit
 */
import test from "node:test";
import assert from "node:assert/strict";
import { phasesOf, phaseSeconds } from "../lib/phases.ts";

/** A run shaped like the recorder's: approach with jaws open, close, carry the
 *  payload up and across, set it down, let go. */
function pickAndPlace({ seconds = 20, graspAt = 0.25, releaseAt = 0.85 } = {}) {
  const hz = 20;
  const n = hz * seconds;
  const s = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const holding = u >= graspAt && u < releaseAt;
    // Lifted while carried, on the table before and after.
    let z = 0;
    if (holding) {
      const v = (u - graspAt) / (releaseAt - graspAt);
      z = Math.sin(Math.PI * Math.min(1, v * 1.15)) * 0.18;
    }
    s.push({
      t: +(i / hz).toFixed(3),
      q: [0, 0, 0, 0, 0, 0],
      grip: holding ? 6 : 42,
      object: [0.3 - 0.13 * u, 0.2 - 0.38 * u, z],
    });
  }
  return s;
}

test("a pick and place splits into the five phases in order", () => {
  const p = phasesOf(pickAndPlace());
  assert.deepEqual(p.map((x) => x.name), ["reach", "grasp", "transport", "place", "release"]);
});

test("the phases tile the recording with no gaps and no overlap", () => {
  const samples = pickAndPlace();
  const p = phasesOf(samples);
  assert.equal(p[0].from, 0);
  assert.equal(p[p.length - 1].to, samples.length);
  for (let i = 1; i < p.length; i += 1) assert.equal(p[i].from, p[i - 1].to);
});

test("the grasp lands where the jaws actually close", () => {
  const samples = pickAndPlace({ graspAt: 0.25 });
  const grasp = phasesOf(samples).find((x) => x.name === "grasp");
  const firstHeld = samples.findIndex((s) => s.grip <= 14);
  assert.ok(grasp.from <= firstHeld && grasp.to > firstHeld,
    `grasp ${grasp.from}..${grasp.to} should contain the first held frame ${firstHeld}`);
});

test("place begins only on the final descent, not on a dip mid-carry", () => {
  const samples = pickAndPlace();
  // Force a dip to the table in the middle of the carry.
  const mid = Math.floor(samples.length * 0.5);
  for (let i = mid; i < mid + 4; i += 1) samples[i].object[2] = 0.001;
  const p = phasesOf(samples);
  const place = p.find((x) => x.name === "place");
  assert.ok(place.from > mid + 4, `place started at ${place.from}, inside the dip at ${mid}`);
});

test("a run that never grasps is one reach, not a fabricated transport", () => {
  const s = pickAndPlace().map((x) => ({ ...x, grip: 42 }));
  const p = phasesOf(s);
  assert.deepEqual(p.map((x) => x.name), ["reach"]);
  assert.equal(p[0].to, s.length);
});

test("a single-frame jaw bounce is not a grasp", () => {
  const s = pickAndPlace().map((x) => ({ ...x, grip: 42 }));
  s[40].grip = 6; // one frame only
  assert.deepEqual(phasesOf(s).map((x) => x.name), ["reach"]);
});

test("phase seconds add up to the run", () => {
  const samples = pickAndPlace({ seconds: 20 });
  const total = Object.values(phaseSeconds(samples)).reduce((a, b) => a + b, 0);
  const span = samples[samples.length - 1].t - samples[0].t;
  assert.ok(Math.abs(total - span) < 0.3, `phases sum to ${total}, run is ${span}`);
});

test("an empty or one-frame recording has no phases to report", () => {
  assert.deepEqual(phasesOf([]), []);
  assert.deepEqual(phasesOf([{ t: 0, q: [0,0,0,0,0,0], grip: 42, object: [0,0,0] }]), []);
});
