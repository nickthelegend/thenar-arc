"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const PULSE_KEY = "thenar.count-me-out";

/**
 * Tell the server a page was opened, and nothing more.
 *
 * The reason analytics is usually a privacy cost is the identifier, not the
 * count. There is no cookie here, no id, no address read on the other end —
 * the row this produces has a path, a date and an integer, and the table has
 * nowhere to put anything else. What it buys is the ability to say which
 * surfaces are used, which is the difference between designing for the pages
 * people open and designing for the pages I happen to think about.
 *
 * Three ways not to be counted, all honoured: Do Not Track, Global Privacy
 * Control, and the switch on /status. The first two are read by the server
 * from the headers the browser already sends; the third is checked here,
 * because a request that is never made is the only opt-out that cannot be
 * ignored by the thing being opted out of.
 */
/**
 * Whether the counter has already refused once this session.
 *
 * Module scope rather than state: it is a fact about the endpoint, not about
 * any one mount, and remounting the component on a navigation must not forget
 * it — forgetting is the behaviour being removed.
 */
let dead = false;

export function Pulse() {
  const path = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!path || last.current === path) return;
    last.current = path;

    try {
      if (localStorage.getItem(PULSE_KEY) === "1") return;
    } catch {
      // Storage blocked. Counting an anonymous page open is still fine.
    }
    // navigator.doNotTrack is the old spec and still what some browsers set.
    if (typeof navigator !== "undefined") {
      const nav = navigator as Navigator & { doNotTrack?: string; globalPrivacyControl?: boolean };
      if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    }

    // Already tried once and been refused. An anonymous page count is the
    // least important request this site makes, and one that cannot succeed
    // should not be reissued on every navigation for the rest of the session:
    // while the counter was unreachable it put a failed request on every page,
    // which is enough to make a monitor call the whole site broken over a
    // number nobody reads.
    if (dead) return;

    // keepalive so a click that navigates away does not cancel the count, and
    // a failure is silently dropped — a missed count is not worth an error.
    const t = setTimeout(() => {
      void fetch("/api/hit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
        keepalive: true,
      })
        .then((r) => { if (!r.ok) dead = true; })
        .catch(() => { dead = true; });
    }, 0);
    return () => clearTimeout(t);
  }, [path]);

  return null;
}
