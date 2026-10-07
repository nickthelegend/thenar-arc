"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Enter the page with weight: from below, blurred and clear, to in place.
 * Once, when it first comes into view.
 */
export function Reveal({
  children, className, delay = 0, as: Tag = "div", fade = false,
}: {
  children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article";
  /** Opacity only. Text clipped to a gradient disappears in Chrome under a
   *  filter or a transform on an ancestor, so gradient headings fade. */
  fade?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        fade
          ? (shown ? "opacity-100" : "opacity-0")
          : (shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-16 opacity-0 blur-md"),
        className,
      )}
    >
      {children}
    </Tag>
  );
}
