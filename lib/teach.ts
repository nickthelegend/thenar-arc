/**
 * Teach and repeat: the arm watches one run a person was paid for, then does
 * the task again on its own, wherever the payload starts and the goal is.
 *
 * A settled run is cut where the jaws closed on the payload and where they
 * opened again. Before the grasp the tool's path is held relative to where the
 * payload was; after the release, relative to the goal; in between it blends
 * from one to the other, and the offset turns with the anchor's bearing from
 * the base, so an approach from the arm's side stays one. Moving the payload
 * or the goal bends the demonstration rather than replaying it blind.
 *
 * A repeat is the robot's work, not a person's, so the station only ever runs
 * one as practice: it is never submitted, never paid, and never counted.
 */
import type { Sample } from "./types";
import { toolFor } from "./embodiment";
import type { ArmKind } from "./scan";

/** The jaws count as closed on something below this opening, in mm. */
const CLOSED_MM = 14;

export type SkillFrame = { t: number; p: [number, number, number]; grip: number; phase: number };
export type Skill = {
  taughtFrom: string;
  durationS: number;
  /** Where the payload was when the jaws closed on it, metres. */
  object: [number, number];
  /** Where it was let go, metres: the demonstration's goal. */
  goal: [number, number];
  graspT: number;
  releaseT: number;
  frames: SkillFrame[];
};

/** Learn a skill from a run's samples, or say why the run cannot teach one. */
export function learn(samples: Sample[], taughtFrom: string, arm: ArmKind = "thenar6"): { skill: Skill } | { skill: null; reason: string } {
  if (samples.length < 20) return { skill: null, reason: "A run needs at least a second of samples to teach from." };
  // The tool is read back through the arm that recorded the run: the same
  // six numbers are different poses on a THENAR-6 and on an SO-101.
  const fk = toolFor(arm);
  const tool = samples.map((s) => fk(s.q));
  // The grasp: jaws closed with the payload between them, which is the moment
  // the payload starts following the tool.
  const grasp = samples.findIndex((s, i) => s.grip <= CLOSED_MM && Math.hypot(tool[i][0] - s.object[0], tool[i][1] - s.object[1]) < 0.09);
  if (grasp < 0) return { skill: null, reason: "The payload was never picked up in this run, so there is nothing to learn from it." };
  const release = samples.findIndex((s, i) => i > grasp && s.grip > CLOSED_MM);
  if (release < 0) return { skill: null, reason: "The payload was still held when this run ended." };
  const t0 = samples[0].t;
  return {
    skill: {
      taughtFrom,
      durationS: samples[samples.length - 1].t - t0,
      object: [samples[grasp].object[0], samples[grasp].object[1]],
      goal: [samples[release].object[0], samples[release].object[1]],
      graspT: samples[grasp].t - t0,
      releaseT: samples[release].t - t0,
      frames: samples.map((s, i) => ({
        t: s.t - t0,
        p: tool[i],
        grip: s.grip,
        phase: i < grasp ? 0 : i >= release ? 1 : (i - grasp) / (release - grasp),
      })),
    },
  };
}

const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const bearing = (p: readonly [number, number]) => Math.atan2(p[1], p[0]);

/** Where the skill puts the tool at time t, for a payload at `object` and a goal at `goal`. */
export function poseAt(skill: Skill, t: number, object: readonly [number, number], goal: readonly [number, number]): { target: [number, number, number]; grip: number; done: boolean } {
  const f = skill.frames;
  let i = 0;
  while (i < f.length - 2 && f[i + 1].t <= t) i++;
  const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const p = [0, 1, 2].map((j) => lerp(a.p[j], b.p[j], k));
  const phase = lerp(a.phase, b.phase, k);
  const from = [lerp(skill.object[0], skill.goal[0], phase), lerp(skill.object[1], skill.goal[1], phase)];
  const to = [lerp(object[0], goal[0], phase), lerp(object[1], goal[1], phase)];
  const turn = lerp(bearing(object) - bearing(skill.object), bearing(goal) - bearing(skill.goal), phase);
  const rx = p[0] - from[0], ry = p[1] - from[1];
  const c = Math.cos(turn), s = Math.sin(turn);
  return {
    target: [to[0] + c * rx - s * ry, to[1] + s * rx + c * ry, p[2]],
    grip: lerp(a.grip, b.grip, k),
    done: t > skill.durationS,
  };
}
