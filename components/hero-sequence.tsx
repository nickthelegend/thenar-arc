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
      // Six steps through the loop, each one a live surface rather than a
      // slide. Someone seeing this for the first time gets the argument in the
      // order it makes sense in.
      { href: "/hub?tour=1", label: "Show me the loop", primary: false },
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
      <section className="grid items-start gap-8 py-14 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10 lg:gap-14 lg:py-20">
        <div className="flex flex-col gap-12">
          {SHEETS.map((s, i) => <Sheet key={s.kicker} sheet={s} level={i === 0 ? 1 : 2} />)}
        </div>
        <ArmFrame />
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: `${SHEETS.length * 100}vh` }}>
      <div className="sticky top-14 flex h-[calc(100dvh-3.5rem)] items-center">
        {/* Two columns from md rather than lg. The arm is the claim this page
            is making, and below 1024px it used to sit under the copy — which
            on any laptop-height viewport put it entirely below the fold, so the
            first thing anyone saw was a paragraph and the top edge of an empty
            black rectangle. The whole argument was one scroll away from being
            visible. */}
        <div className="grid w-full items-center gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10 lg:gap-14">
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
      /**
       * Out fast, in after it has gone.
       *
       * Both sheets used to cross-fade over the same 0.55s, symmetrically, in
       * the same grid cell — so halfway through, each sat near half opacity and
       * both were legible at once. Two headlines, two paragraphs and two rows
       * of buttons printed over each other. It did not read as a transition; it
       * read as a rendering fault, and it was the first thing on the page.
       *
       * A cross-fade between two opaque texts has no midpoint that works. So
       * they take turns: the outgoing sheet is gone in 160ms, and the incoming
       * one does not begin until it is. The total is shorter than before and
       * only one sheet is ever readable.
       */
      transition={
        on
          ? { duration: 0.34, delay: 0.16, ease: [0.16, 1, 0.3, 1] }
          : { duration: 0.16, ease: "linear" }
      }
      // Every sheet occupies the same cell. The ones that are not showing have
      // to be inert as well as invisible, or their links stay clickable and
      // stay in the tab order under the sheet that is actually on screen.
      className="col-start-1 row-start-1"
      style={{ pointerEvents: on ? "auto" : "none" }}
      aria-hidden={!on}
      inert={!on}
    >
      <Sheet sheet={sheet} level={on ? 1 : 2} />
    </motion.div>
  );
}

/**
 * `level` keeps the document to one h1.
 *
 * Four sheets each carrying an h1 gave the page four top-level headings. Three
 * are inert and aria-hidden so only one was ever exposed, but the document
 * outline is read by more than a screen reader. The sheet that is showing is
 * the page's heading; the others are demoted while they wait.
 */
function Sheet({ sheet, level = 1 }: { sheet: (typeof SHEETS)[number]; level?: 1 | 2 }) {
  const Head = level === 1 ? "h1" : "h2";
  return (
    <div className="flex flex-col gap-5">
      {/* No eyebrow. "The shortage" sat above "Physical AI is short of data,
          not compute." and said the same thing in smaller type — the heading
          carries its own weight, and the rail beside it already says which of
          the four this is. */}
      <Head className="text-balance font-display text-[clamp(2rem,4.4vw,3.4rem)] font-700 leading-[0.96] tracking-[-0.025em]">
        {sheet.head.map((line, i) => (
          <span key={line} className="block">
            {line}
            {i < sheet.head.length - 1 ? null : null}
          </span>
        ))}
      </Head>

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
    <div className="relative h-[300px] border border-rule bg-ink-0 sm:h-[380px] md:h-[420px] lg:h-[520px]">
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
