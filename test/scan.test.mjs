import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScan, formatScan, instructionOf, checkScan, homography, apply, sheetCorners, checkQuad, footprint } from "../lib/scan.ts";
import { goalFor, startFor, GOAL, START } from "../lib/bench.ts";
import { evaluate, deviationFromSamples } from "../lib/score.ts";

test("a scanned scene round-trips through the task's name", () => {
  const name = formatScan("Put the cup on the coaster", { pick: [0.202, 0.038], place: [0.288, -0.066] });
  assert.equal(name, "Put the cup on the coaster [scan 202,38 > 288,-66]");
  assert.deepEqual(parseScan(name), { pick: [0.202, 0.038], place: [0.288, -0.066] });
  assert.equal(instructionOf(name), "Put the cup on the coaster");
});

test("an ordinary task has no scene and keeps the bench's datum", () => {
  assert.equal(parseScan("Put the toothpaste into the upper drawer"), null);
  assert.deepEqual(goalFor("Put the toothpaste into the upper drawer"), GOAL);
  assert.deepEqual(startFor(undefined), START);
  assert.deepEqual(goalFor("Put the cup on the coaster [scan 202,38 > 288,-66]"), [0.288, -0.066]);
});

test("a scene the arm cannot use is refused, with the reason", () => {
  assert.match(checkScan({ pick: [0.6, 0], place: [0.2, 0] }), /600 mm/);
  assert.match(checkScan({ pick: [0.2, 0.01], place: [0.21, 0.02] }), /already on its target/);
  assert.equal(parseScan("Move it [scan 600,0 > 200,0]"), null, "an out-of-reach tag is not a scene");
});

test("four clicked corners measure the table to within a millimetre", () => {
  const Htrue = [0.9, -0.12, 310, 0.05, 0.62, 140, 0.0001, 0.0009, 1];
  const corners = sheetCorners();
  const H = homography(corners.map((c) => apply(Htrue, c)), corners);
  for (const p of [{ x: 250, y: 60 }, { x: 150, y: 0 }]) {
    const back = apply(H, apply(Htrue, p));
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y) < 1);
  }
  assert.match(checkQuad([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }, { x: 200, y: 200 }]), /cross/);
  assert.deepEqual(footprint({ x: 100, y: 50, w: 40, h: 80 }), { x: 120, y: 130 });
});

test("a scanned task is scored against its own goal, not the bench's", () => {
  const place = [0.288, -0.066];
  const samples = Array.from({ length: 40 }, (_, i) => ({ t: i / 20, q: [0, 0, 0, 0, 0, 0], grip: i > 5 && i < 30 ? 6 : 42, object: [0.202 + ((place[0] - 0.202) * Math.min(i, 30)) / 30, 0.038 + ((place[1] - 0.038) * Math.min(i, 30)) / 30, 0] }));
  assert.ok(deviationFromSamples(samples, place) < 1);
  assert.ok(deviationFromSamples(samples) > 100, "against the bench goal it would be far off");
  const traj = { taskId: "5", samples, durationSeconds: 2, success: true, deviationMm: 0 };
  assert.equal(evaluate(traj, 60, 1, place).success, true);
  assert.equal(evaluate(traj, 60, 1).success, false);
});

test("the arm travels in the name too, beside the scan, and either can be absent", async () => {
  const { formatName, armOf, instructionOf, parseScan } = await import("../lib/scan.ts");
  const n = formatName("Put the glass on the plate", { arm: "so101", scan: { pick: [0.199, 0.035], place: [0.309, -0.052] } });
  assert.equal(n, "Put the glass on the plate [arm so101] [scan 199,35 > 309,-52]");
  assert.equal(armOf(n), "so101");
  assert.equal(instructionOf(n), "Put the glass on the plate");
  assert.deepEqual(parseScan(n), { pick: [0.199, 0.035], place: [0.309, -0.052] });
  assert.equal(formatName(n, { arm: "thenar6" }), "Put the glass on the plate [arm thenar6]");
  assert.equal(armOf(formatName(n, { arm: "thenar6" })), "thenar6");
});

test("an untagged task runs on the SO-101, unless it needs two arms", async () => {
  const { armOf } = await import("../lib/scan.ts");
  assert.equal(armOf("Put the pen on the closed laptop"), "so101");
  assert.equal(armOf("Steady the crate with both arms and place the battery inside"), "thenar6");
  assert.equal(armOf("Steady the crate with both arms [arm so101]"), "so101", "a tag always wins");
});

test("a detected object is measured at its footprint centre, not its front edge", async () => {
  const { homography, apply, invert, groundCentre, cameraFrom, sheetCorners } = await import("../lib/scan.ts");
  // The camera of the rendered test photo: arm frame, 1600×1200, fov 50°,
  // at (-320, 0, 520) mm looking at (300, 0, 0) mm.
  const W = 1600, Hh = 1200, f = (Hh / 2) / Math.tan((50 * Math.PI) / 360);
  const eye = [-320, 0, 520], at = [300, 0, 0];
  const sub = (a, b) => a.map((v, i) => v - b[i]), norm = (v) => v.map((x) => x / Math.hypot(...v));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(sub(at, eye)), right = norm(cross(fwd, [0, 0, 1])), up = cross(right, fwd);
  const project = (p) => { const d = sub(p, eye), z = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]; return { x: W / 2 + (f * (d[0] * right[0] + d[1] * right[1] + d[2] * right[2])) / z, y: Hh / 2 - (f * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2])) / z }; };
  const H = homography(sheetCorners().map((c) => project([c.x, c.y, 0])), sheetCorners());
  // A 98 mm ball standing at (200, 100) mm: its image box, from its silhouette.
  const r = 49, c = [200, 100, r], pts = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j <= 20; j++) { const t = (i / 40) * 2 * Math.PI, u = (j / 20) * Math.PI; pts.push(project([c[0] + r * Math.sin(u) * Math.cos(t), c[1] + r * Math.sin(u) * Math.sin(t), c[2] + r * Math.cos(u)])); }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const bottomEdge = apply(H, { x: box.x + box.w / 2, y: box.y + box.h });
  const centre = groundCentre(H, box, { w: W, h: Hh });
  const cam = cameraFrom(H, { w: W, h: Hh });
  assert.ok(Math.hypot(cam.x + 320, cam.y, cam.z - 520) < 2, `camera recovered at ${cam.x.toFixed(0)}, ${cam.y.toFixed(0)}, ${cam.z.toFixed(0)} mm`);
  assert.ok(Math.hypot(bottomEdge.x - 200, bottomEdge.y - 100) > 15, "the bottom edge alone is well short");
  assert.ok(Math.hypot(centre.x - 200, centre.y - 100) < 10, `centre measured at ${centre.x.toFixed(0)}, ${centre.y.toFixed(0)} mm`);
  const back = apply(invert(H), apply(H, { x: 700, y: 650 }));
  assert.ok(Math.hypot(back.x - 700, back.y - 650) < 1e-6, "invert undoes the homography");
});
