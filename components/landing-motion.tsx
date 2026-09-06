"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * The landing page's motion, in one place.
 *
 * The conceit is an instrument coming up to readiness: the datum rules draw
 * themselves out from their terminators, the headline settles, and the live
 * readings arrive last, because on a real bench the measurement is the last
 * thing to appear. Everything animates *from* an offset with gsap.from, so the
 * page's resting state is the visible one — if this never runs, nothing is
 * hidden.
 *
 * Scroll work is one batched reveal for the run sequence, not an entrance on
 * every section.
 */
export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const boot = gsap.timeline({ defaults: { ease: "expo.out" } });

      boot
        .from('[data-anim="hero-head"]', { y: 18, opacity: 0, duration: 1.1 })
        .from('[data-anim="hero-copy"]', { y: 12, opacity: 0, duration: 0.9 }, "-=0.75")
        .from('[data-anim="hero-cta"] > *', { y: 10, opacity: 0, duration: 0.7, stagger: 0.08 }, "-=0.6")
        // The rules draw out from their centre, the way a dimension line is set.
        .from('[data-anim="rule"]', { scaleX: 0, transformOrigin: "50% 50%", duration: 1.2, stagger: 0.06 }, "-=0.7")
        .from('[data-anim="readings"] > *', { y: 8, opacity: 0, duration: 0.8, stagger: 0.06 }, "-=0.9");

      // The run sequence reveals as a set, once, when it comes into view.
      ScrollTrigger.batch('[data-anim="step"]', {
        start: "top 88%",
        once: true,
        onEnter: (batch) =>
          gsap.from(batch, {
            y: 20,
            opacity: 0,
            duration: 0.8,
            ease: "expo.out",
            stagger: 0.07,
          }),
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}
