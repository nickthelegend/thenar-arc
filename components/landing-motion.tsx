"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * The landing page's motion, in one place.
 *
 * The conceit is an instrument coming up to readiness: the datum rules draw
 * themselves out from their terminators, and the live readings arrive last,
 * because on a real bench the measurement is the last thing to appear.
 *
 * Nothing is built until the document is actually visible, and that is a
 * correctness requirement rather than an optimisation. gsap.from applies its
 * start values the moment the tween is created and only animates *back* to the
 * resting state as the timeline ticks — and a backgrounded tab does not hand
 * out animation frames. So on a page opened in a background tab the readings
 * were set to opacity 0 at mount and stayed there: cmd-click the link, come
 * back a minute later, and the figures this page reads off the contract were
 * simply not on it. The old comment here claimed the resting state was the
 * visible one and that nothing would be hidden if this never ran. That was the
 * intent, but from-tweens do the opposite, and the numbers paid for it.
 *
 * Now the timeline is only ever created while frames are actually being served,
 * so the hidden state cannot outlive the animation that is supposed to undo it.
 * A page that never becomes visible never has anything hidden on it.
 */
export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    let ctx: gsap.Context | undefined;

    const build = () => {
      ctx = gsap.context(() => {
        const boot = gsap.timeline({ defaults: { ease: "expo.out" } });

        // The hero animates nothing now — it is a plain section. What is left
        // is the page under it: the rules draw out from their centre, the way a
        // dimension line is set, and the readings arrive last.
        boot
          .from('[data-anim="rule"]', { scaleX: 0, transformOrigin: "50% 50%", duration: 1.2, stagger: 0.06 })
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
    };

    if (document.visibilityState === "visible") {
      build();
      return () => ctx?.revert();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      build();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      ctx?.revert();
    };
  }, []);

  return null;
}
