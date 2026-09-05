/**
 * Inverse kinematics for AXON-6.
 *
 * The link lengths below are read off cad/arm.py — they are the same numbers
 * the GLB was generated from, converted to metres. Changing a dimension there
 * means changing it here; the arm and its solver are one part.
 *
 * The solve is analytic, not iterative: base yaw from the target azimuth, then
 * a planar two-link solve to the wrist centre, then a wrist pitch that returns
 * the tool to vertical. A closed form matters because the operator is driving
 * this at 60 fps and an iterative solver would visibly hunt.
 */

export const BASE_Z = 0.07;        // J1 height above the plinth
export const SHOULDER_UP = 0.122;  // J1 -> J2
export const L1 = 0.21;            // J2 -> J3, upper arm
export const L2 = 0.204;           // J3 -> J4, forearm incl. elbow barrel
export const TOOL = 0.165;         // J4 -> gripping point, wrist held vertical

/** Shoulder joint position in world space. */
export const SHOULDER_HEIGHT = BASE_Z + SHOULDER_UP;

/** Furthest the tool can reach from the base axis, with a margin off the singularity. */
export const REACH_MAX = (L1 + L2) * 0.985;
export const REACH_MIN = Math.abs(L1 - L2) + 0.02;

export type Joints = {
  j1: number;
  j2: number;
  j3: number;
  j5: number;
  /** True when the target was outside the workspace and had to be pulled in. */
  clamped: boolean;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Solve for a tool tip at `target` with the gripper pointing straight down.
 * Returns joint angles in radians in the arm's own Z-up frame.
 */
export function solve(target: [number, number, number]): Joints {
  const [px, py, pz] = target;

  // The wrist centre sits one tool length above the gripping point.
  const wz = pz + TOOL;

  const j1 = Math.atan2(py, px);

  const r = Math.hypot(px, py);
  const dz = wz - SHOULDER_HEIGHT;

  let d = Math.hypot(r, dz);
  const clamped = d > REACH_MAX || d < REACH_MIN;
  d = clamp(d, REACH_MIN, REACH_MAX);

  // phi: angle of the shoulder-to-wrist line, measured from +Z toward the radius.
  const phi = Math.atan2(r, dz);

  // gamma: angle between that line and the upper arm.
  const gamma = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));

  // beta: interior elbow angle.
  const beta = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));

  const j2 = phi - gamma;   // elbow-up branch: the arm stays clear of the table
  const j3 = Math.PI - beta;

  // Bring the tool back to vertical regardless of the shoulder and elbow.
  const j5 = Math.PI - (j2 + j3);

  return { j1, j2, j3, j5, clamped };
}

/** Forward check used by the recorder so the logged pose is the achieved one. */
export function toolPosition(j: Joints): [number, number, number] {
  const wr = L1 * Math.sin(j.j2) + L2 * Math.sin(j.j2 + j.j3);
  const wz = SHOULDER_HEIGHT + L1 * Math.cos(j.j2) + L2 * Math.cos(j.j2 + j.j3);
  return [wr * Math.cos(j.j1), wr * Math.sin(j.j1), wz - TOOL];
}
