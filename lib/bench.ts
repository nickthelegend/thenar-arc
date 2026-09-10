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
export const GOAL: readonly [number, number] = [0.16, -0.18];

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
