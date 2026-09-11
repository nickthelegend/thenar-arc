"use client";

import { useEffect, useRef, useState } from "react";
import spec from "@/lib/arm-spec.json";

const SWEEP = 150; // degrees of base rotation traversed across the section
const REACH = spec.reach_mm;
const PLINTH_R = 132; // cad/arm.py: the granite pad the base bolts to

/**
 * A pinned stage where the arm's own base rotation is driven by the scroll,
 * with the section title sliding the other way behind it.
 *
 * The rotating thing is a plan view, not a picture turned on its side. J1 is a
 * yaw axis, so from above it sweeps — which is a rotation that reads correctly
 * in two dimensions, drawn to scale from the arm's real reach. Spinning the
 * elevation instead would have looked like the arm doing a cartwheel, which is
 * not a thing this machine does.
 *
 * The readout is driven by the same progress value as the rotation, so the
 * number is telling the truth about what the drawing is doing.
 */
export function CounterTravelStage() {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let ticking = false;
    const update = () => {
      const top = el.offsetTop;
      const span = Math.max(1, el.offsetHeight - window.innerHeight);
      setP(Math.min(1, Math.max(0, (window.scrollY - top) / span)));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; update(); });
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const deg = (p - 0.5) * SWEEP;
  const R = 210;
  const scale = R / REACH;
  const rad = ((deg - 90) * Math.PI) / 180;

  return (
    <section ref={ref} className="on-stage" style={{ height: "320vh", position: "relative" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100svh",
          overflow: "clip",
          isolation: "isolate",
          display: "grid",
          placeItems: "center",
        }}
      >
        {/* Behind, travelling the other way. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            zIndex: 1,
            whiteSpace: "nowrap",
            fontFamily: "var(--font-archivo), sans-serif",
            fontWeight: 900,
            fontSize: "clamp(78px, 17vw, 250px)",
            letterSpacing: "-0.05em",
            lineHeight: 1,
            opacity: 0.14,
            transform: `translateX(${(0.5 - p) * 46}%)`,
            willChange: "transform",
          }}
        >
          Base rotation&nbsp;&nbsp;Base rotation&nbsp;&nbsp;Base rotation
        </div>

        <svg
          viewBox="-260 -260 520 520"
          style={{ position: "relative", zIndex: 2, width: "min(56vw, 600px)", height: "auto" }}
          aria-label={`Plan view of the arm's ${REACH} mm reach, base rotated ${deg.toFixed(1)} degrees`}
        >
          {/* The reach circle and the plinth, to scale against each other. */}
          <circle r={R} fill="none" stroke="var(--hair)" strokeWidth={1} />
          <circle r={PLINTH_R * scale} fill="none" stroke="var(--hair)" strokeWidth={1} />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const inner = i % 6 === 0 ? R - 14 : R - 7;
            // Rounded, because the server and the client serialise the same
            // float differently (…824098 against …8241) and every tick then
            // mismatched on hydration.
            const f = (n: number) => Number(n.toFixed(3));
            return (
              <line
                key={i}
                x1={f(Math.cos(a) * inner)} y1={f(Math.sin(a) * inner)}
                x2={f(Math.cos(a) * R)} y2={f(Math.sin(a) * R)}
                stroke="var(--hair)" strokeWidth={1}
              />
            );
          })}
          {/* The arm itself: heavier than the construction geometry around it. */}
          <line
            x1={0} y1={0}
            x2={Number((Math.cos(rad) * R).toFixed(3))} y2={Number((Math.sin(rad) * R).toFixed(3))}
            stroke="var(--ink)" strokeWidth={2.5}
          />
          <circle cx={Number((Math.cos(rad) * R).toFixed(3))} cy={Number((Math.sin(rad) * R).toFixed(3))} r={5} fill="var(--accent)" />
          <circle r={4} fill="var(--ink)" />
        </svg>

        <span className="meta meta-sm muted" style={{ position: "absolute", left: "clamp(20px,4vw,56px)", bottom: 28, zIndex: 4 }}>
          J1 yaw · plan view · to scale
        </span>
        <span className="meta meta-sm num" style={{ position: "absolute", right: "clamp(20px,4vw,56px)", bottom: 28, zIndex: 4 }}>
          <span className="accent">{deg >= 0 ? "+" : "−"}{Math.abs(deg).toFixed(1)}°</span>
          <span className="muted">&nbsp;&nbsp;R {REACH} mm</span>
        </span>
      </div>
    </section>
  );
}
