"use client";

import { useEffect } from "react";

/**
 * Register the offline shell.
 *
 * Deliberately not in the layout's head as a raw script: registration should
 * happen after the page is usable, never before it, because a worker
 * installing during first paint competes with the page it is meant to serve.
 *
 * Failure is silent on purpose. A browser that refuses service workers — a
 * private window, a policy, an unsupported engine — should get the site,
 * exactly as it does now, rather than an error about a feature it never asked
 * for.
 */
export function InstallShell() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // After load, so it never competes with the first paint.
    const go = () => { void navigator.serviceWorker.register("/sw.js").catch(() => {}); };
    if (document.readyState === "complete") {
      const t = setTimeout(go, 0);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, []);

  return null;
}
