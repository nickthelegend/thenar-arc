"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";

/** The arm is a WebGL canvas: it has no business in the server render, and it
 *  was loaded this way before the hero became a sequence. */
const HeroArm = dynamic(() => import("@/components/hero-arm").then((m) => m.HeroArm));
import { cn } from "@/lib/cn";

/**
 * The argument, advanced by scrolling.
 *
 * The instrument stays put and the scale moves past it — the same relationship
 * a dial indicator has with the part it is reading, which is the language the
 * rest of this product is already in. The arm on the right never re-mounts; only
 * the sheet of copy beside it changes, so the thing being explained is
 * continuously visible while the explanation advances.
 *
 * The sheets are a real scroll, not a hijacked one: the section is four
 * viewports tall and the inner frame is sticky, so the scrollbar tells the truth
 * about how far through you are, browser find still works, and nothing has to
 * intercept the wheel.
 */

const SHEETS = [
  {
    kicker: "The shortage",
    head: ["Physical AI is short of data,", "not compute."],
    body:
      "Robot manipulation data is collected in closed labs, slowly and narrowly. " +
      "A model can only generalise across the situations somebody bothered to record.",
    note: "No hardware. No GPU. A browser and a wallet.",
    cta: [
      { href: "/hub", label: "Find a task", primary: true },
      { href: "/foundry", label: "See a cap table", primary: false },
    ],
  },
  {
    kicker: "The work",
    head: ["You drive the arm", "in a browser."],
    body:
      "A six-axis manipulator, generated from named dimensions rather than downloaded. " +
      "Pick the payload up, bring it to rest inside the datum circle, and let go.",
    note: "Drag to move the tool · W S reach · A D swing · E Q raise · Space jaws.",
    cta: [{ href: "/space", label: "Walk onto the floor", primary: true }],
  },
  {
    kicker: "The measurement",
    head: ["Every run is measured", "against the datum."],
    body:
      "Placement inside ±25 mm carries 55%, smoothness of the tool path 25%, your " +
      "time against par 20%. The server re-scores the trajectory and signs the result.",
    note: "The contract will not pay a score it did not sign.",
    cta: [{ href: "/spec", label: "Read the spec sheet", primary: false }],
  },
  {
    kicker: "The settlement",
    head: ["One transaction records it", "and pays you."],
    body:
      "The trajectory hash, its task, your address and the verified score go on chain " +
      "in the same call that transfers the AVAX. When a buyer licences the corpus, " +
      "every contributor is paid again, weighted by what their run measured.",
    note: "Avalanche Fuji · chain 43113 · every payout is a public transaction.",
    cta: [{ href: "/leaderboard", label: "See who has been paid", primary: true }],
  },
] as const;

export function HeroSequence() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  /**
   * Which sheet is showing, from the scroll position itself.
   *
   * Driven by the scroll event rather than an animation-frame loop: a browser
   * that has backgrounded the tab stops handing out frames, and a hero whose
   * state only advances on a frame is a hero that is stuck on sheet one in
   * every screenshot, thumbnail and preview anything ever takes of it.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Geometry is measured on resize only; the scroll handler then reads
    // nothing but scrollY. That keeps it off the layout path and, more to the
    // point, off the animation-frame path — throttling this with
    // requestAnimationFrame is what left the hero stuck on sheet one in every
    // backgrounded tab.
    let top = 0;
    let span = 1;

    const remeasure = () => {
      top = el.offsetTop;
      span = Math.max(1, el.offsetHeight - window.innerHeight);
      update();
    };

    const update = () => {
      const p = (window.scrollY - top) / span;
      const i = Math.floor(p * SHEETS.length);
      setActive(Math.min(SHEETS.length - 1, Math.max(0, i)));
    };

    remeasure();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", remeasure, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: el.offsetTop + (span * (i + 0.5)) / SHEETS.length,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  // Reduced motion gets the same words as an ordinary stacked page: no sticky
  // frame, nothing that moves on its own.
  if (reduced) {
    return (
      <section className="grid items-start gap-8 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:py-20">
        <div className="flex flex-col gap-12">
          {SHEETS.map((s) => <Sheet key={s.kicker} sheet={s} />)}
        </div>
        <ArmFrame />
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: `${SHEETS.length * 100}vh` }}>
      <div className="sticky top-14 flex h-[calc(100dvh-3.5rem)] items-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="flex items-start gap-5 sm:gap-7">
            <Rail active={active} onSelect={goTo} />

            {/* Stacked in one grid cell so the column does not resize between
                sheets of different length. */}
            <div className="grid min-h-[320px] flex-1 sm:min-h-[360px]">
              {SHEETS.map((s, i) => (
                <ScrollSheet key={s.kicker} sheet={s} on={i === active} />
              ))}
            </div>
          </div>

          <ArmFrame />
        </div>
      </div>
    </section>
  );
}

function ScrollSheet({ sheet, on }: { sheet: (typeof SHEETS)[number]; on: boolean }) {
  return (
    <motion.div
      animate={{ opacity: on ? 1 : 0, y: on ? 0 : 14 }}
      initial={false}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      // Every sheet occupies the same cell. The ones that are not showing have
      // to be inert as well as invisible, or their links stay clickable and
      // stay in the tab order under the sheet that is actually on screen.
      className="col-start-1 row-start-1"
      style={{ pointerEvents: on ? "auto" : "none" }}
      aria-hidden={!on}
      inert={!on}
    >
      <Sheet sheet={sheet} />
    </motion.div>
  );
}

function Sheet({ sheet }: { sheet: (typeof SHEETS)[number] }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="label">{sheet.kicker}</span>

      <h1 className="font-display text-[clamp(2.2rem,5.4vw,4rem)] font-700 leading-[0.94] tracking-[-0.02em]">
        {sheet.head.map((line, i) => (
          <span key={line} className="block">
            {line}
            {i < sheet.head.length - 1 ? null : null}
          </span>
        ))}
      </h1>

      <p className="max-w-[58ch] text-[16px] leading-relaxed text-scribe-2">{sheet.body}</p>

      <div className="flex flex-wrap items-center gap-3">
        {sheet.cta.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={cn(
              "border px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] transition-colors",
              c.primary
                ? "border-scribe bg-scribe text-ink-0 hover:border-signal-hi hover:bg-signal-hi"
                : "border-rule-strong text-scribe hover:border-scribe",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <p className="font-mono text-[13px] leading-relaxed text-scribe-3">{sheet.note}</p>
    </div>
  );
}

/** The scale the sheets are read against: a datum rail, ticked per sheet. */
function Rail({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex shrink-0 flex-col gap-0 pt-1" aria-label="Sections">
      {SHEETS.map((s, i) => {
        const on = i === active;
        return (
          <li key={s.kicker} className="flex">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={on ? "step" : undefined}
              className="group flex items-center gap-2.5 py-2.5 text-left"
            >
              <span
                className={cn(
                  "block h-px transition-all duration-300",
                  on ? "w-9 bg-signal" : "w-4 bg-rule-strong group-hover:w-6 group-hover:bg-scribe-3",
                )}
              />
              <span
                className={cn(
                  "font-mono text-[12px] tabular-nums transition-colors",
                  on ? "text-signal" : "text-scribe-3 group-hover:text-scribe-2",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ArmFrame() {
  return (
    <div className="relative h-[340px] border border-rule bg-ink-0 sm:h-[440px] lg:h-[520px]">
      <HeroArm />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule bg-ink-1/90 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">
        <span>THENAR-6</span>
        <span>6 revolute axes</span>
        <span>parallel jaw, 42 mm</span>
        <Link href="/spec" className="pointer-events-auto text-signal transition-colors hover:text-signal-hi">
          generated from cad/arm.py &rarr;
        </Link>
      </div>
    </div>
  );
}
