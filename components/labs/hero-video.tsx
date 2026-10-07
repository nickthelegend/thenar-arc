"use client";

import { useEffect, useRef } from "react";

/**
 * The hero film. React does not write `muted` into server-rendered HTML, and
 * a browser will not autoplay a video it believes has sound, so the film is
 * muted and started here, after hydration. If the browser still refuses (data
 * saver, reduced motion), the poster stays: nothing is lost.
 */
export function HeroVideo({ className, poster, sources }: { className?: string; poster: string; sources: { src: string; type: string }[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.muted = true;
    v.defaultMuted = true;
    void v.play().catch(() => undefined);
  }, []);
  return (
    <video ref={ref} className={className} autoPlay muted loop playsInline preload="auto" poster={poster}>
      {sources.map((s) => <source key={s.src} src={s.src} type={s.type} />)}
    </video>
  );
}
