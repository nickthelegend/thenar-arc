/**
 * What each arm a task can ask for is, for the surfaces that describe it and
 * the measurements that need its kinematics.
 *
 * A recording's joint columns only mean something on the arm that made them,
 * so anything that turns angles back into a tool position — the coherence
 * check a buyer reads, teaching from a paid run — asks for the arm first.
 */
import { toolPosition } from "./kinematics";
import { So101Chain, so101Tool } from "./so101";
import type { ArmKind } from "./scan";

export type Embodiment = {
  kind: ArmKind;
  /** What the dataset's `embodiment` field says. */
  name: string;
  /** Short, for chips. */
  label: string;
  gripper: string;
  /** What each of a sample's six joint columns is. */
  joints: string[];
  blurb: string;
};

export const EMBODIMENTS: Record<ArmKind, Embodiment> = {
  thenar6: {
    kind: "thenar6",
    name: "THENAR-6",
    label: "THENAR-6",
    gripper: "parallel-jaw, 42 mm",
    joints: ["J1 yaw", "J2 pitch", "J3 pitch", "J4 (fixed)", "J5 pitch", "J6 (fixed)"],
    blurb: "The station's own six-axis arm, simulated at true scale.",
  },
  so101: {
    kind: "so101",
    name: "SO-101 · MG996R follower R3",
    label: "SO-101",
    gripper: "single moving jaw, 0–63 mm",
    joints: ["base rotation", "shoulder", "elbow", "wrist pitch", "wrist roll", "jaw"],
    blurb: "The open SO-101, built with MG996R servos: a desk arm you can own. Drawn and solved from its CAD.",
  },
};

export const embodimentOf = (arm: ArmKind) => EMBODIMENTS[arm];

/** Forward kinematics for one arm: a sample's joints (radians) → the tool, metres. */
export function toolFor(arm: ArmKind): (q: readonly number[]) => [number, number, number] {
  if (arm === "so101") {
    const chain = new So101Chain();
    return (q) => so101Tool(q, chain);
  }
  return (q) => toolPosition({ j1: q[0], j2: q[1], j3: q[2], j5: q[4], clamped: false });
}
