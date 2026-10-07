import { GOAL, TOLERANCE_M } from "./bench";

/**
 * Roll a policy out in the station's own dynamics, headlessly.
 *
 * Lifted from scripts/eval-policy.mjs, which was a script one person ran on a
 * laptop. Making it a module is what lets anybody submit a policy and have it
 * scored on the same starts, by the same code, rather than on numbers they
 * report themselves — which is the same argument this project makes about
 * trajectories, applied to the models trained on them.
 *
 * Nothing here executes submitted code. A policy is three thousand numbers and
 * a fixed shape; evaluating one is arithmetic. That is the property that makes
 * a public submission surface safe to have at all, and it is worth being
 * explicit that it is a property of the architecture rather than of a sandbox.
 *
 * The dynamics are the station's: the same kinematics, the same capture
 * radius, the same tolerance. A policy that scores here would drive the arm on
 * the page the same way.
 */

const START: [number, number, number] = [0.22, 0.14, 0];
const CAPTURE_R = 0.09;
const PAYLOAD_H = 0.075;
const TABLE_Z = 0;
const GRIP_OPEN = 42;
const GRIP_CLOSED_MM = 14;

const BASE_Z = 0.07, SHOULDER_UP = 0.122, L1 = 0.21, L2 = 0.204, TOOL = 0.165;
const SHOULDER_HEIGHT = BASE_Z + SHOULDER_UP;
const REACH_MAX = (L1 + L2) * 0.985, REACH_MIN = Math.abs(L1 - L2) + 0.02;

/** The architecture a submission has to have. Anything else is not a policy
 *  this station can drive, and is refused rather than coerced. */
export const ARCH = { in: 10, hidden: 48, out: 4 } as const;

export type PolicyWeights = {
  mean: number[]; std: number[];
  W1: number[][]; b1: number[];
  W2: number[][]; b2: number[];
  W3: number[][]; b3: number[];
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function solve(t: number[]): [number, number, number] {
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

function toolPosition(q: number[]): [number, number, number] {
  const [j1, j2, j3] = q;
  const wr = L1 * Math.sin(j2) + L2 * Math.sin(j2 + j3);
  const wz = SHOULDER_HEIGHT + L1 * Math.cos(j2) + L2 * Math.cos(j2 + j3);
  return [wr * Math.cos(j1), wr * Math.sin(j1), wz - TOOL];
}

const relu = (v: number[]) => v.map((x) => (x > 0 ? x : 0));

function act(P: PolicyWeights, tool: number[], object: number[], grip: number): number[] {
  const raw = [
    tool[0], tool[1], tool[2],
    object[0] - tool[0], object[1] - tool[1], object[2] - tool[2],
    GOAL[0] - object[0], GOAL[1] - object[1], 0 - object[2],
    grip > GRIP_CLOSED_MM ? 0 : 1,
  ];
  const x = raw.map((v, i) => (v - P.mean[i]) / P.std[i]);
  const a1 = relu(P.W1.map((w, i) => w.reduce((s, wv, j) => s + wv * x[j], P.b1[i])));
  const a2 = relu(P.W2.map((w, i) => w.reduce((s, wv, j) => s + wv * a1[j], P.b2[i])));
  return P.W3.map((w, i) => w.reduce((s, wv, j) => s + wv * a2[j], P.b3[i]));
}

/**
 * The starts every submission is judged on.
 *
 * Fixed and published, so two policies are comparable and a submitter knows
 * what they are being asked to do. They are offsets from the station's own
 * start, small enough to be the same task and spread enough that a policy
 * which only memorised one approach fails most of them.
 */
export const STARTS: [number, number][] = [
  [0, 0], [0.02, -0.02], [-0.02, 0.02], [0.03, 0.01],
  [-0.01, -0.03], [0.01, 0.03], [-0.03, 0], [0, 0.02],
];

/** Steps of simulation per rollout. Long enough for a slow approach, bounded
 *  because this runs on a request. */
const HORIZON = 900;

export type Rollout = { grasped: boolean; placed: boolean; devMm: number; held: boolean };

export function rollout(P: PolicyWeights, startOffset: [number, number]): Rollout {
  const object: [number, number, number] = [START[0] + startOffset[0], START[1] + startOffset[1], TABLE_Z];
  let target: [number, number, number] = [0.3, 0, 0.16];
  let grip = GRIP_OPEN;
  let held = false;
  let grasped = false;

  for (let step = 0; step < HORIZON; step += 1) {
    const tool = toolPosition(solve(target));
    const a = act(P, tool, object, grip);

    // The action is a tool delta in the units the trainer scaled to.
    target = [target[0] + a[0] / 100, target[1] + a[1] / 100, target[2] + a[2] / 100];
    target[2] = clamp(target[2], TABLE_Z + 0.012, 0.46);
    const radial = Math.hypot(target[0], target[1]);
    if (radial > REACH_MAX) {
      target[0] = (target[0] / radial) * REACH_MAX;
      target[1] = (target[1] / radial) * REACH_MAX;
    }
    // A policy that emits NaN stops being simulated rather than poisoning the
    // arithmetic for the rest of the horizon and reporting a NaN deviation.
    if (!Number.isFinite(target[0]) || !Number.isFinite(target[1]) || !Number.isFinite(target[2])) {
      return { grasped, placed: false, devMm: Infinity, held };
    }

    grip = a[3] > 0.5 ? 6 : GRIP_OPEN;

    const t2 = toolPosition(solve(target));
    const planar = Math.hypot(t2[0] - object[0], t2[1] - object[1]);
    const withinHeight = t2[2] > object[2] - 0.02 && t2[2] < object[2] + PAYLOAD_H + 0.055;
    if (!held && grip <= GRIP_CLOSED_MM && planar < CAPTURE_R && withinHeight) { held = true; grasped = true; }
    if (held && grip > GRIP_CLOSED_MM) held = false;
    if (held) {
      object[0] = t2[0]; object[1] = t2[1];
      object[2] = Math.max(TABLE_Z, t2[2] - PAYLOAD_H / 2);
    } else if (object[2] > TABLE_Z) {
      object[2] = Math.max(TABLE_Z, object[2] - 0.9 * 0.05);
    }
  }

  const dev = Math.hypot(object[0] - GOAL[0], object[1] - GOAL[1]);
  return {
    grasped,
    placed: !held && dev <= TOLERANCE_M && object[2] <= TABLE_Z + 1e-3,
    devMm: dev * 1000,
    held,
  };
}

export type Evaluation = {
  starts: number;
  grasped: number;
  placed: number;
  medianFinalMm: number;
  perStart: { start: [number, number]; grasped: boolean; placed: boolean; devMm: number }[];
};

/** Every published start, in order. Deterministic: the same weights always
 *  produce the same evaluation, which is what makes a leaderboard mean
 *  anything. */
export function evaluatePolicy(P: PolicyWeights): Evaluation {
  const perStart = STARTS.map((s) => ({ start: s, ...rollout(P, s) }));
  const devs = perStart.map((r) => r.devMm).sort((a, b) => a - b);
  return {
    starts: STARTS.length,
    grasped: perStart.filter((r) => r.grasped).length,
    placed: perStart.filter((r) => r.placed).length,
    medianFinalMm: devs[devs.length >> 1],
    perStart: perStart.map(({ start, grasped, placed, devMm }) => ({ start, grasped, placed, devMm })),
  };
}

/** Whether a submission is the shape this station can drive. Returns the
 *  reason it is not, so a submitter is told what was wrong rather than that
 *  something was. */
export function shapeError(p: unknown): string | null {
  const P = p as PolicyWeights;
  if (!P || typeof P !== "object") return "a policy must be an object";
  const vec = (v: unknown, n: number, name: string) =>
    Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x))
      ? null : `${name} must be ${n} finite numbers`;
  const mat = (v: unknown, rows: number, cols: number, name: string) =>
    Array.isArray(v) && v.length === rows && v.every((r) => vec(r, cols, name) === null)
      ? null : `${name} must be ${rows}×${cols} finite numbers`;

  return (
    vec(P.mean, ARCH.in, "mean") ??
    vec(P.std, ARCH.in, "std") ??
    (Array.isArray(P.std) && P.std.some((x) => x === 0) ? "std must not contain a zero" : null) ??
    mat(P.W1, ARCH.hidden, ARCH.in, "W1") ??
    vec(P.b1, ARCH.hidden, "b1") ??
    mat(P.W2, ARCH.hidden, ARCH.hidden, "W2") ??
    vec(P.b2, ARCH.hidden, "b2") ??
    mat(P.W3, ARCH.out, ARCH.hidden, "W3") ??
    vec(P.b3, ARCH.out, "b3")
  );
}
