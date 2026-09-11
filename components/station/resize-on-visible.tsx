"use client";

import { useEffect } from "react";

/**
 * Re-measure the scene once the tab is actually being looked at.
 *
 * react-three-fiber sizes its canvas from a ResizeObserver on the element it
 * fills. A tab that loads in the background gets its layout, so the container
 * has a real size, but the canvas is left at the HTML default of 300×150 — and
 * because the container's size never *changes* when the tab is later brought to
 * the front, the observer has nothing to report and the canvas stays 300×150
 * for the rest of the visit. Measured on the deployed station in a background
 * tab: container 500×334, canvas 300×150, still 300×150 after focus.
 *
 * That is the whole 3D viewport of the surface an operator works in, so it
 * cannot be left to whether the tab happened to be in front at load. On
 * becoming visible the container is perturbed by a hair for one frame, which
 * gives the observer the change it is waiting for; the size it then reports is
 * the real one.
 */
export function ResizeOnVisible() {
  useEffect(() => {
    const nudge = () => {
      if (document.visibilityState !== "visible") return;
      // The element r3f measures is the canvas's own container, which it
      // creates; finding it at runtime avoids threading a ref through the
      // scene just to hold onto a div.
      const el = document.querySelector("canvas")?.parentElement;
      if (!el) return;
      const had = el.style.width;
      el.style.width = "99.9%";
      requestAnimationFrame(() => {
        el.style.width = had;
      });
    };

    // Once on mount, for the tab that was already hidden when this rendered,
    // and again whenever it comes back.
    nudge();
    document.addEventListener("visibilitychange", nudge);
    return () => document.removeEventListener("visibilitychange", nudge);
  }, []);

  return null;
}
