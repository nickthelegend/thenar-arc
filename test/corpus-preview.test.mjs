import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_POINTS, previewOf, thin } from "../lib/corpus-preview.ts";

/** A pick and place: on the table, lifted 6 cm, carried 20 cm in x, set down. */
function run(n) {
  return Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    const z = u > 0.25 && u < 0.75 ? 0.06 : 0;
    return { t: u * 9.8, q: [u, -u, 0.5, 0, 1, 0], grip: z ? 4 : 30, object: [0.1 + 0.2 * u, 0.05, z] };
  });
}

test("thin keeps both ends and never more than it is asked for", () => {
  assert.deepEqual(thin(0, 48), []);
  assert.deepEqual(thin(5, 48), [0, 1, 2, 3, 4]);
  for (const n of [49, 166, 1000, 12_345]) {
    const k = thin(n, 48);
    assert.equal(k[0], 0);
    assert.equal(k[k.length - 1], n - 1);
    assert.ok(k.length <= 48 && k.length >= 47, `${n} -> ${k.length}`);
    assert.ok(k.every((v, i) => i === 0 || v > k[i - 1]), "strictly increasing");
  }
});

const mm10 = (v) => Math.round(v * 1e4) / 1e4;

test("a preview starts and ends where the run did, to a tenth of a millimetre", () => {
  const s = run(166);
  const p = previewOf(s);
  assert.equal(p.frames, 166);
  assert.equal(p.seconds, 9.8);
  assert.equal(p.path.length, PREVIEW_POINTS);
  assert.deepEqual(p.path[0], [mm10(s[0].object[0]), mm10(s[0].object[1])]);
  assert.deepEqual(p.path.at(-1), [mm10(s.at(-1).object[0]), mm10(s.at(-1).object[1])]);
  assert.equal(p.joints.length, 6);
  assert.ok(p.joints.every((j) => j.length === PREVIEW_POINTS));
  assert.equal(p.joints[0][0], 0);
  assert.equal(p.joints[0].at(-1), 1);
});

test("the carried stretch and the lift come from the payload's height", () => {
  const p = previewOf(run(166));
  assert.equal(p.liftMm, 60);
  const [a, b] = p.carried;
  assert.ok(a > 0 && b < PREVIEW_POINTS - 1 && a < b);
  // A run that never lifted anything has no carried stretch.
  const flat = run(40).map((s) => ({ ...s, object: [s.object[0], s.object[1], 0] }));
  assert.equal(previewOf(flat).carried, null);
  assert.equal(previewOf(flat).liftMm, 0);
});

test("no samples, no preview", () => {
  assert.equal(previewOf([]), null);
});
