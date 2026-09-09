import { solve, toolPosition, REACH_MAX } from "@/lib/kinematics";
import type { Sample } from "@/lib/types";

/**
 * Demonstrating with a phone, by moving it.
 *
 * Mobile capture was named as a non-capability, and I refused it twice more on
 * the grounds that a phone cannot produce a usable trajectory. That reasoning
 * was about dead reckoning — integrating accelerometer readings, which drifts
 * to nonsense within seconds and would put noise into the corpus wearing a
 * trajectory's shape. It is correct about DeviceMotion and wrong about the
 * device.
 *
 * A phone running an `immersive-ar` session reports a *tracked* pose. It comes
 * from the same visual-inertial SLAM the device uses to place furniture in a
 * room — corrected against what the camera sees, not integrated from
 * acceleration — and it does not drift the way dead reckoning does. That is a
 * real six-degree-of-freedom measurement of where a hand went.
 *
 * So this maps that pose into the workspace and solves the arm to it: the
 * operator moves their phone as though it were the gripper, and what is
 * recorded is a trajectory in exactly the format every other run uses. The
 * demonstration is the hand motion; the arm follows it.
 *
 * What is not claimed: this is not vision. Nothing here sees the payload, and
 * the scene is still the simulated one. It is a different input device for the
 * same station, which is what "ego-centric capture" can honestly mean here.
 */

/** Where the operator's hand starts, in their own room. Set on the first
 *  frame, so the workspace is anchored wherever they happen to be standing. */
export type Anchor = { x: number; y: number; z: number };

/**
 * How far a hand movement scales into the workspace.
 *
 * The arm reaches 408 mm and a person demonstrating at arm's length moves
 * through roughly a metre, so a hand metre is compressed into the bench. Any
 * other choice makes the workspace either unreachable or twitchy.
 */
export const HAND_TO_BENCH = 0.42;

export function anchorFrom(p: DOMPointReadOnly): Anchor {
  return { x: p.x, y: p.y, z: p.z };
}

/**
 * The tool position a device pose asks for.
 *
 * WebXR is Y-up with -Z forward; the station's plane is X-forward, Y-left,
 * Z-up. The axis swap is here rather than at the call site so there is one
 * place to be wrong about it.
 */
export function toolFromPose(p: DOMPointReadOnly, a: Anchor): [number, number, number] {
  const forward = -(p.z - a.z) * HAND_TO_BENCH;
  const left = -(p.x - a.x) * HAND_TO_BENCH;
  const up = (p.y - a.y) * HAND_TO_BENCH;

  // Rest pose plus the hand's displacement, then clamped into the envelope —
  // an operator's arm is longer than the robot's and reaching past it should
  // stop the tool at the edge rather than fold the solver.
  const t: [number, number, number] = [0.24 + forward, left, Math.max(0.012, 0.14 + up)];
  const radial = Math.hypot(t[0], t[1]);
  if (radial > REACH_MAX) {
    t[0] = (t[0] / radial) * REACH_MAX;
    t[1] = (t[1] / radial) * REACH_MAX;
  }
  return t;
}

/**
 * One recorded frame, in the same shape every other run uses.
 *
 * Deliberately identical: a handheld demonstration that produced its own
 * format would be a second kind of trajectory, and the corpus would then have
 * two things in it that cannot be trained on together.
 */
export function frameFrom(
  t: number,
  pose: DOMPointReadOnly,
  anchor: Anchor,
  gripMm: number,
  object: [number, number, number],
): Sample {
  const target = toolFromPose(pose, anchor);
  const j = solve(target);
  return {
    t: Number(t.toFixed(3)),
    q: [j.j1, j.j2, j.j3, 0, j.j5, 0],
    grip: Number(gripMm.toFixed(2)),
    object: [
      Number(object[0].toFixed(5)),
      Number(object[1].toFixed(5)),
      Number(object[2].toFixed(5)),
    ],
  };
}

/** Where the tool ends up for a pose, for the caller that needs to move the
 *  payload with it. */
export function toolAt(pose: DOMPointReadOnly, anchor: Anchor): [number, number, number] {
  return toolPosition(solve(toolFromPose(pose, anchor)));
}
