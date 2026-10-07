/**
 * Who else is in the room.
 *
 * A station has always been one operator alone with a scene. This holds the
 * live position of everyone working the same task, so a run can be driven
 * beside other people rather than in private.
 *
 * It is deliberately memory only and deliberately not authoritative. Nothing
 * here is ever scored, paid or written to a chain — the trajectory a run is
 * judged on is still recorded locally and verified by signature, exactly as
 * before. Presence is a view of the room, so losing it on a restart costs
 * nothing, and no operator can affect another's measurement by lying to it.
 */

export type Pose = {
  /** The operator's address, or an anonymous id for a spectator-turned-driver. */
  id: string;
  /** Tool centre point, metres. */
  tool: [number, number, number];
  /** Jaw opening, mm. */
  grip: number;
  held: boolean;
  /** Server clock, ms. Never the client's — a client that lies about time
   *  would otherwise keep a stale ghost on the floor forever. */
  at: number;
};

/** How long a pose stands before its ghost is dropped. Four seconds is well
 *  past a dropped frame and well short of a stalled tab looking alive. */
const STALE_MS = 4_000;

const rooms = new Map<number, Map<string, Pose>>();

function room(taskId: number) {
  let r = rooms.get(taskId);
  if (!r) { r = new Map(); rooms.set(taskId, r); }
  return r;
}

function prune(r: Map<string, Pose>, now: number) {
  for (const [id, p] of r) if (now - p.at > STALE_MS) r.delete(id);
}

/** Record where one operator's tool is right now. */
export function place(taskId: number, pose: Omit<Pose, "at">) {
  const now = Date.now();
  const r = room(taskId);
  r.set(pose.id, { ...pose, at: now });
  prune(r, now);
}

/** Everyone currently in the room, excluding the caller if they name themselves. */
export function roster(taskId: number, exclude?: string): Pose[] {
  const now = Date.now();
  const r = room(taskId);
  prune(r, now);
  return [...r.values()].filter((p) => p.id !== exclude);
}

/** Leave immediately rather than waiting to go stale. */
export function leave(taskId: number, id: string) {
  rooms.get(taskId)?.delete(id);
}

/** Population of every occupied room, for the space index. */
export function occupancy(): { taskId: number; operators: number }[] {
  const now = Date.now();
  const out: { taskId: number; operators: number }[] = [];
  for (const [taskId, r] of rooms) {
    prune(r, now);
    if (r.size > 0) out.push({ taskId, operators: r.size });
  }
  return out.sort((a, b) => b.operators - a.operators);
}
