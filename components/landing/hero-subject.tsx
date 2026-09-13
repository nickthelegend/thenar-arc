"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * THENAR-6 in the hero: the still render first, and the arm moving once the
 * browser can show it properly.
 *
 * The motion is a ten-second clip generated with Google Veo from that same
 * render, with its background keyed out so the arm still passes between the
 * back and front layers of the word. Transparency needs VP9 with an alpha
 * channel, which Safari does not draw, so Safari keeps the still — as does
 * anyone who has asked for reduced motion, and any browser where the clip
 * fails to load. The wrapper carries the positioning and the parallax hook, so
 * swapping what is inside it moves nothing on the page.
 */
export function HeroSubject() {
  const [motion, setMotion] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Read after mount: none of these exist during the server render.
    const t = setTimeout(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
      const vp9 = document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "";
      setMotion(!reduced && !safari && vp9);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="subject rv"
      data-hero-subject
      data-rv-now
      style={{ transform: "translateY(var(--par, 0px))" }}
    >
      <Image
        src="/hero-arm.png"
        alt="THENAR-6, a six-axis arm with a parallel-jaw gripper, reaching"
        width={1228}
        height={566}
        priority
        className="subject-still"
        style={{ opacity: playing ? 0 : 1 }}
      />
      {motion ? (
        <video
          className="subject-motion"
          src="/hero-arm.webm"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          onPlaying={() => setPlaying(true)}
          onError={() => { setMotion(false); setPlaying(false); }}
          style={{ opacity: playing ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}
