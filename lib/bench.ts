/**
 * The bench, as numbers.
 *
 * These used to live in the station's viewport, under a comment saying the
 * scoring depended on them and so they lived there "and nowhere else". The
 * first half was true and the second could not be: the viewport is a
 * client-side three.js module, and the process that signs a score runs on a
 * server that must never import it. So the scorer did not have the datum, and
 * a placement measured against a datum the scorer could not see had to be
 * taken from whoever submitted it.
 *
 * Both halves import from here now, which is what makes the measurement one
 * measurement rather than two that agree until they do not.
 */

/**
 * Where a payload has to come to rest, in metres on the table plane.
 *
 * One datum, shared by every task on this bench. It is a property of the
 * furniture rather than of the instruction — the tasks differ in what is moved
 * and where it starts, not in where it lands.
 */
import { parseScan } from "./scan";

export const GOAL: readonly [number, number] = [0.16, -0.18];

/** Where a payload starts on this bench, unless the task was scanned. */
export const START: readonly [number, number] = [0.22, 0.14];

/**
 * A task's own datum. Every task on the bench shares GOAL and START, except
 * one scanned from a real table, whose name on chain carries the measured
 * positions (lib/scan.ts). Read from the name, so the station, the replay and
 * the verifier all derive the same point from the same chain state.
 */
export const goalFor = (name?: string): readonly [number, number] => (name ? parseScan(name)?.place : undefined) ?? GOAL;
export const startFor = (name?: string): readonly [number, number] => (name ? parseScan(name)?.pick : undefined) ?? START;

/**
 * Where each payload stands when a run begins, on the table plane.
 *
 * One payload stands at the task's start. Two stand apart either side of it,
 * far enough that "the nearest one" is never a coin toss. The station draws
 * them here, and the verifier checks that a recording begins here.
 */
export function startPoses(start: readonly [number, number], count: number): [number, number][] {
  return count < 2
    ? [[start[0], start[1]]]
    : [
        [start[0] - 0.03, start[1] + 0.03],
        [start[0] + 0.06, start[1] - 0.05],
      ];
}

/**
 * Where a second arm stands, when a scene has one.
 *
 * Far enough that the two envelopes overlap only across the middle of the
 * bench, which is the point of a two-arm scene: a region both can reach and a
 * region only one can. Close enough that both bases and the datum fit in the
 * camera's frame together.
 */
export const ARM_B_BASE: [number, number] = [0.34, 0.02];

/** The goal ring drawn on the table. Outside this the payload was not placed
 *  at all, which is a different statement from placed badly. */
export const GOAL_R = 0.075;

/** The placement band, in scene units. 25 mm is the scorer's own tolerance. */
export const TOLERANCE_M = 0.025;

/**
 * How far each payload's seat sits from the datum centre when a scene carries
 * two of them, in metres.
 *
 * Both seats have to stay inside the goal ring — the ring is what the operator
 * aims at — while leaving the objects far enough apart not to intersect. At
 * 0.038 the seats are 76 mm apart and the payloads are 56 mm across, so they
 * sit beside each other rather than through each other, and each is still
 * within its own 25 mm tolerance of a point inside the 75 mm ring.
 */
export const SEAT_OFFSET = 0.038;

/** Where payload `i` of `n` has to come to rest. One payload owns the datum
 *  itself, which is what keeps every single-object run scoring exactly as it
 *  did before scenes could carry two. */
export function seatFor(goal: readonly [number, number], i: number, n: number): [number, number] {
  if (n < 2) return [goal[0], goal[1]];
  return [goal[0] + (i === 0 ? -SEAT_OFFSET : SEAT_OFFSET), goal[1]];
}
