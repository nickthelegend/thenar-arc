"use client";

import { useEffect } from "react";

/**
 * Motion as an enhancement over a page that is already finished without it.
 *
 * The `js` class is the switch: every reveal rule in landing.css is scoped to
 * it, and it is only ever added when motion is actually wanted. So the
 * reduced-motion render and the no-JS render are not degraded versions of the
 * page — they are the page, with nothing hidden and nothing waiting.
 */
export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.classList.add("js");

    /**
     * Anything already on screen at load reveals on the next frame and is never
     * observed.
     *
     * An IntersectionObserver with a negative bottom margin will not fire for an
     * element that is already inside that margin, and on a short viewport the
     * hero word and the subject are exactly that. Observed, they would wait for
     * an intersection that never comes and stay invisible for the whole visit —
     * losing the hero's entire signature move, on phones, permanently.
     */
    const immediate = Array.from(document.querySelectorAll<HTMLElement>("[data-rv-now]"));
    requestAnimationFrame(() => immediate.forEach((el) => el.classList.add("in")));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    document
      .querySelectorAll<HTMLElement>(".rv:not([data-rv-now])")
      .forEach((el) => io.observe(el));

    // One passive, rAF-throttled listener drives every scroll effect on the
    // page. In the hero that is the word rising and the subject sinking as you
    // leave, so the two part company on the way out.
    const word = document.querySelectorAll<HTMLElement>("[data-hero-word]");
    const subject = document.querySelector<HTMLElement>("[data-hero-subject]");
    const hero = document.querySelector<HTMLElement>("[data-hero]");

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!hero) return;
        const h = hero.offsetHeight || 1;
        const p = Math.min(1, Math.max(0, window.scrollY / h));
        word.forEach((w) => {
          w.style.setProperty("--par", `${(-p * 46).toFixed(2)}px`);
        });
        if (subject) subject.style.setProperty("--par", `${(p * 34).toFixed(2)}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      root.classList.remove("js");
    };
  }, []);

  return null;
}
