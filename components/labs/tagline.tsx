"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A statement that lights up word by word as it crosses the middle of the
 * screen, the way the reference's "Base8 is the only app…" does.
 *
 * `lines` is a list of lines; a word wrapped in *asterisks* takes the prism
 * gradient once lit. One scroll listener, throttled to animation frames.
 */
export function Tagline({ lines, className }: { lines: string[]; className?: string }) {
  const words = lines.map((l) => l.split(" "));
  const total = words.reduce((n, w) => n + w.length, 0);
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // From the block's top reaching 80% of the screen to its bottom reaching 45%.
      const start = vh * 0.8, end = vh * 0.45;
      const p = (start - r.top) / (start - end + r.height);
      setLit(Math.max(0, Math.min(total, Math.round(p * total))));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [total]);
  let i = 0;
  return (
    <div ref={ref} className={cn("max-w-[760px] text-3xl font-medium leading-tight tracking-tight sm:text-5xl sm:leading-tight", className)}>
      {words.map((line, li) => (
        <p key={li} className="mb-6 last:mb-0">
          {line.map((w, wi) => {
            const n = i++;
            const accent = /^\*.*\*[.,]?$/.test(w);
            const text = accent ? w.replace(/\*/g, "") : w;
            return (
              <span
                key={wi}
                className={cn(
                  "transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  n < lit ? (accent ? "text-prism" : "text-white") : "text-white/25",
                )}
              >
                {text}{wi < line.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
