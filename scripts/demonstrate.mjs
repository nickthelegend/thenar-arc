/**
 * Produce demonstrations whose arm and payload agree.
 *
 * The first attempt at a policy failed and the diagnosis was the corpus:
 * twenty of thirty-five recordings report the jaws closed while the tool is
 * two hundred millimetres from the object, because they came from test scripts
 * that wrote a linear ramp into the joint column instead of the pose that
 * moved the payload. A network cannot learn reaching from that; it can only
 * learn that reaching does not matter.
 *
 * This drives the station's real dynamics instead — the same inverse
 * kinematics, the same capture radius, the same grasp rule — with a scripted
 * controller, and records what actually happens. The result is coherent by
 * construction: the payload moves because the tool moved it.
 *
 * These are machine demonstrations and nothing here pretends otherwise. They
 * exist to answer whether the pipeline from corpus to policy works at all,
 * which is a different question from whether humans have filled the corpus
 * yet, and the answer to the first should not wait on the second.
 *
 *   node scripts/demonstrate.mjs
 */
import { writeFileSync } from "node:fs";

const GOAL = [0.16, -0.18, 0];
const TABLE_Z = 0, PAYLOAD_H = 0.075, CAPTURE_R = 0.09;
const GRIP_OPEN = 42, GRIP_SHUT = 6, GRIP_CLOSED_MM = 14;
const HZ = 20, DT = 1 / HZ;

const BASE_Z = 0.07, SHOULDER_UP = 0.122, L1 = 0.21, L2 = 0.204, TOOL = 0.165;
const SH = BASE_Z + SHOULDER_UP;
const REACH_MAX = (L1 + L2) * 0.985, REACH_MIN = Math.abs(L1 - L2) + 0.02;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function solve(t) {
  const [px, py, pz] = t;
  const wz = pz + TOOL;
  const j1 = Math.atan2(py, px);
  const r = clamp(Math.hypot(px, py), REACH_MIN, REACH_MAX);
  const dz = wz - SH;
  const d = clamp(Math.hypot(r, dz), REACH_MIN, REACH_MAX);
  const c3 = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const j3 = -Math.acos(c3);
  const j2 = Math.atan2(r, dz) - Math.atan2(L2 * Math.sin(j3), L1 + L2 * Math.cos(j3));
  return { j1, j2, j3 };
}
function toolPosition(j) {
  const wr = L1 * Math.sin(j.j2) + L2 * Math.sin(j.j2 + j.j3);
  const wz = SH + L1 * Math.cos(j.j2) + L2 * Math.cos(j.j2 + j.j3);
  return [wr * Math.cos(j.j1), wr * Math.sin(j.j1), wz - TOOL];
}

/** A deterministic wobble, so demonstrations differ the way a person's would
 *  without any of them being random noise the policy must average away. */
function rng(seed) {
  let x = seed | 0;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
}

/**
 * One demonstration: reach over the payload, descend, close, carry, release.
 *
 * A proportional controller rather than a spline, because the policy has to
 * learn a mapping from what it can see to what to do next — and a controller
 * that closes the loop on the same observations produces exactly that, at
 * every state it passes through rather than only along one path.
 */
function demonstrate(seed) {
  const rand = rng(seed);
  const start = [0.22 + (rand() - 0.5) * 0.09, 0.14 + (rand() - 0.5) * 0.09, TABLE_Z];
  const object = [...start];
  let target = [0.3, 0, 0.16];
  let grip = GRIP_OPEN;
  let held = false;
  const samples = [];

  const CARRY_Z = 0.14 + rand() * 0.04;
  const gain = 0.16 + rand() * 0.06;

  for (let i = 0; i < 260; i += 1) {
    const j = solve(target);
    const tool = toolPosition(j);

    samples.push({
      t: +(i * DT).toFixed(3),
      q: [+j.j1.toFixed(5), +j.j2.toFixed(5), +j.j3.toFixed(5), 0, 0, 0],
      grip: +grip.toFixed(2),
      object: object.map((v) => +v.toFixed(5)),
    });

    const planar = Math.hypot(tool[0] - object[0], tool[1] - object[1]);
    const overGoal = Math.hypot(object[0] - GOAL[0], object[1] - GOAL[1]);

    let want;
    if (!held) {
      // Over it first, then down onto it. Descending while still off to one
      // side is how an operator knocks the payload away, and a policy trained
      // on that learns to do the same.
      want = planar > 0.03
        ? [object[0], object[1], Math.max(CARRY_Z, tool[2])]
        : [object[0], object[1], object[2] + PAYLOAD_H / 2];
      if (planar < 0.03 && tool[2] < object[2] + PAYLOAD_H * 0.75) grip = GRIP_SHUT;
    } else if (overGoal > 0.012) {
      want = [GOAL[0], GOAL[1], CARRY_Z];
    } else {
      // An absolute height, not one relative to the payload. While the jaws
      // are shut the payload is pinned to the tool, so a target of
      // "object + half a payload" is exactly where the tool already is — the
      // controller descended nowhere and never released, reaching the datum
      // perfectly and holding the object above it for ever.
      want = [GOAL[0], GOAL[1], TABLE_Z + PAYLOAD_H / 2];
      if (tool[2] < TABLE_Z + PAYLOAD_H * 0.62) grip = GRIP_OPEN;
    }

    target = [
      target[0] + (want[0] - tool[0]) * gain,
      target[1] + (want[1] - tool[1]) * gain,
      target[2] + (want[2] - tool[2]) * gain,
    ];
    target[2] = clamp(target[2], TABLE_Z + 0.012, 0.46);
    const radial = Math.hypot(target[0], target[1]);
    if (radial > REACH_MAX) { target[0] = (target[0] / radial) * REACH_MAX; target[1] = (target[1] / radial) * REACH_MAX; }

    const t2 = toolPosition(solve(target));
    const p2 = Math.hypot(t2[0] - object[0], t2[1] - object[1]);
    const inHeight = t2[2] > object[2] - 0.02 && t2[2] < object[2] + PAYLOAD_H + 0.055;
    if (!held && grip <= GRIP_CLOSED_MM && p2 < CAPTURE_R && inHeight) held = true;
    if (held && grip > GRIP_CLOSED_MM) held = false;
    if (held) { object[0] = t2[0]; object[1] = t2[1]; object[2] = Math.max(TABLE_Z, t2[2] - PAYLOAD_H / 2); }
    else if (object[2] > TABLE_Z) object[2] = Math.max(TABLE_Z, object[2] - 0.9 * DT);
  }

  const dev = Math.hypot(object[0] - GOAL[0], object[1] - GOAL[1]) * 1000;
  return { samples, devMm: dev, settled: object[2] <= TABLE_Z + 1e-3 };
}

// Trace one before running the batch, so a controller that never grasps is
// visible as that rather than as a zero.
if (process.env.TRACE) {
  const d = demonstrate(7919);
  const s0 = d.samples;
  const at = (i) => `t=${s0[i].t} grip=${s0[i].grip} obj=[${s0[i].object.map(v=>v.toFixed(3))}]`;
  for (const i of [0, 20, 40, 60, 90, 130, 180, 259]) console.log(" ", at(i));
  console.log("  final deviation", d.devMm.toFixed(0), "mm, settled", d.settled);
  process.exit(0);
}

const N = 220;
const eps = [];
let good = 0;
for (let s = 1; s <= N; s += 1) {
  const d = demonstrate(s * 7919);
  // Only demonstrations that actually did the task. A policy cloned from
  // failures learns to fail.
  if (d.settled && d.devMm <= 25) { eps.push({ hash: `demo_${s}`, taskId: 0, samples: d.samples }); good += 1; }
}
console.log(`${good} of ${N} scripted demonstrations placed inside tolerance`);
writeFileSync("/tmp/demos.json", JSON.stringify(eps));
console.log("written to /tmp/demos.json");
