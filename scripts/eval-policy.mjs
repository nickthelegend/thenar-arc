/**
 * Roll the policy out and see whether it does the task.
 *
 * Loss is not the claim. "A policy trained on this corpus" is only worth
 * saying if the thing drives the arm and puts the payload where the task asks,
 * so this closes the loop in the station's own dynamics — the same kinematics,
 * the same capture radius, the same tolerance — and reports what happens.
 *
 * A number that would be an embarrassment is still reported. The point of
 * running this is to find out, not to have something to quote.
 */
import { readFileSync } from "node:fs";

const P = JSON.parse(readFileSync("public/policy.json", "utf8"));
const GOAL = [0.16, -0.18, 0], START = [0.22, 0.14, 0];
const TOLERANCE_M = 0.025, CAPTURE_R = 0.09, PAYLOAD_H = 0.075, TABLE_Z = 0;
const GRIP_OPEN = 42, GRIP_CLOSED_MM = 14;

const BASE_Z = 0.07, SHOULDER_UP = 0.122, L1 = 0.21, L2 = 0.204, TOOL = 0.165;
const SHOULDER_HEIGHT = BASE_Z + SHOULDER_UP;
const REACH_MAX = (L1 + L2) * 0.985, REACH_MIN = Math.abs(L1 - L2) + 0.02;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function solve(t) {
  const [px, py, pz] = t;
  const wz = pz + TOOL;
  const j1 = Math.atan2(py, px);
  const r = clamp(Math.hypot(px, py), REACH_MIN, REACH_MAX);
  const dz = wz - SHOULDER_HEIGHT;
  const d = clamp(Math.hypot(r, dz), REACH_MIN, REACH_MAX);
  const cos3 = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const j3 = -Math.acos(cos3);
  const j2 = Math.atan2(r, dz) - Math.atan2(L2 * Math.sin(j3), L1 + L2 * Math.cos(j3));
  return [j1, j2, j3];
}
function toolPosition(q) {
  const [j1, j2, j3] = q;
  const wr = L1 * Math.sin(j2) + L2 * Math.sin(j2 + j3);
  const wz = SHOULDER_HEIGHT + L1 * Math.cos(j2) + L2 * Math.cos(j2 + j3);
  return [wr * Math.cos(j1), wr * Math.sin(j1), wz - TOOL];
}

const relu = (v) => v.map((x) => (x > 0 ? x : 0));
function policy(tool, object, grip) {
  const raw = [
    tool[0], tool[1], tool[2],
    object[0] - tool[0], object[1] - tool[1], object[2] - tool[2],
    GOAL[0] - object[0], GOAL[1] - object[1], GOAL[2] - object[2],
    grip > GRIP_CLOSED_MM ? 0 : 1,
  ];
  const x = raw.map((v, i) => (v - P.mean[i]) / P.std[i]);
  const a1 = relu(P.W1.map((w, i) => w.reduce((s, wv, j) => s + wv * x[j], P.b1[i])));
  const a2 = relu(P.W2.map((w, i) => w.reduce((s, wv, j) => s + wv * a1[j], P.b2[i])));
  return P.W3.map((w, i) => w.reduce((s, wv, j) => s + wv * a2[j], P.b3[i]));
}

/** One rollout, from a start the policy was not necessarily shown. */
function rollout(startOffset = [0, 0]) {
  const object = [START[0] + startOffset[0], START[1] + startOffset[1], TABLE_Z];
  let target = [0.3, 0, 0.16];
  let grip = GRIP_OPEN;
  let held = false;
  let grasped = false;

  const HORIZON = Number(process.env.HORIZON ?? 900);
  for (let step = 0; step < HORIZON; step += 1) {
    const q = solve(target);
    const tool = toolPosition(q);
    const a = policy(tool, object, grip);

    // The action is a tool delta in the same units the trainer scaled to.
    target = [target[0] + a[0] / 100, target[1] + a[1] / 100, target[2] + a[2] / 100];
    target[2] = clamp(target[2], TABLE_Z + 0.012, 0.46);
    const radial = Math.hypot(target[0], target[1]);
    if (radial > REACH_MAX) { target[0] = (target[0] / radial) * REACH_MAX; target[1] = (target[1] / radial) * REACH_MAX; }

    grip = a[3] > 0.5 ? 6 : GRIP_OPEN;

    const t2 = toolPosition(solve(target));
    const planar = Math.hypot(t2[0] - object[0], t2[1] - object[1]);
    const withinHeight = t2[2] > object[2] - 0.02 && t2[2] < object[2] + PAYLOAD_H + 0.055;
    if (!held && grip <= GRIP_CLOSED_MM && planar < CAPTURE_R && withinHeight) { held = true; grasped = true; }
    if (held && grip > GRIP_CLOSED_MM) held = false;
    if (held) { object[0] = t2[0]; object[1] = t2[1]; object[2] = Math.max(TABLE_Z, t2[2] - PAYLOAD_H / 2); }
    else if (object[2] > TABLE_Z) object[2] = Math.max(TABLE_Z, object[2] - 0.9 * 0.05);
  }

  const dev = Math.hypot(object[0] - GOAL[0], object[1] - GOAL[1]);
  return { grasped, placed: !held && dev <= TOLERANCE_M && object[2] <= TABLE_Z + 1e-3, devMm: dev * 1000, held };
}

console.log(`policy: ${P.params} parameters, trained on ${P.trainedOn.episodes} episodes`);
console.log(`loss: train ${P.loss.train.toFixed(4)}, held out ${P.loss.heldOut.toFixed(4)}\n`);

const starts = [[0,0],[0.02,-0.02],[-0.02,0.02],[0.03,0.01],[-0.01,-0.03],[0.01,0.03],[-0.03,0],[0,0.02]];
let grasped = 0, placed = 0; const devs = [];
for (const s of starts) {
  const r = rollout(s);
  devs.push(r.devMm);
  if (r.grasped) grasped++;
  if (r.placed) placed++;
  console.log(`  start ${JSON.stringify(s).padEnd(14)} grasped ${r.grasped ? "yes" : "no "}  placed ${r.placed ? "yes" : "no "}  final ${r.devMm.toFixed(0)} mm`);
}
console.log(`\ngrasped ${grasped}/${starts.length}, placed inside tolerance ${placed}/${starts.length}`);
console.log(`median final distance ${devs.sort((a,b)=>a-b)[devs.length>>1].toFixed(0)} mm (tolerance ±25 mm)`);
