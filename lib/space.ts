"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Ghost = {
  id: string;
  tool: [number, number, number];
  grip: number;
  held: boolean;
  at: number;
};

/** Six a second: fast enough that a ghost moves rather than teleports, slow
 *  enough that a room of ten is a handful of requests, not a flood. */
const HZ = 6;

/**
 * Presence in a task's room.
 *
 * The operator's own pose goes up and everyone else's comes back in the same
 * round trip, so a full exchange is one request. When there is no pose to send
 * — a spectator, or an operator who has not started — it falls back to reading
 * the room.
 *
 * None of this touches the run being measured. The trajectory is still recorded
 * locally and verified by signature; if this fails entirely, the run is
 * unaffected and simply has no ghosts in it.
 */
export function useSpace(taskId: number, me: string | null | undefined, active: boolean) {
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const pose = useRef<{ tool: [number, number, number]; grip: number; held: boolean } | null>(null);
  const failures = useRef(0);

  /** Called from the render loop; keeps only the latest, never queues. */
  const report = useCallback((tool: [number, number, number], grip: number, held: boolean) => {
    pose.current = { tool, grip, held };
  }, []);

  useEffect(() => {
    if (!active || !Number.isInteger(taskId)) return;
    let live = true;

    const tick = async () => {
      try {
        const p = pose.current;
        const res = p && me
          ? await fetch(`/api/space/${taskId}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: me, ...p }),
            })
          : await fetch(`/api/space/${taskId}${me ? `?me=${me}` : ""}`);
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { operators: Ghost[] };
        if (live) { setGhosts(d.operators ?? []); failures.current = 0; }
      } catch {
        // The room is a nicety. Give up quietly after a run of failures rather
        // than hammering a backend that is plainly not answering.
        failures.current += 1;
        if (live && failures.current > 5) setGhosts([]);
      }
    };

    const id = setInterval(tick, 1000 / HZ);
    void tick();

    return () => {
      live = false;
      clearInterval(id);
      // Leave cleanly so the room does not hold a ghost for four seconds after
      // the tab is gone. keepalive is what lets this survive the unload.
      if (me) {
        void fetch(`/api/space/${taskId}?me=${me}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };
  }, [taskId, me, active]);

  return { ghosts, report };
}
