import Link from "next/link";
import dynamic from "next/dynamic";

/** The arm is a WebGL canvas: it has no business in the server render. */
const HeroArm = dynamic(() => import("@/components/hero-arm").then((m) => m.HeroArm));

/**
 * The thesis, and the thing it is about, in one screen.
 *
 * This replaces a paginated hero: four sheets of copy cross-fading in a sticky
 * frame over four viewports of scroll, with a numbered rail down the left to
 * say which of the four you were on.
 *
 * It went because of what it was paginating. Sheets two, three and four were
 * the run — you drive the arm, the run is measured, the transaction pays you —
 * and the page already tells that story further down, as "One run, start to
 * payment": four columns, side by side, readable at a glance, in the one place
 * on this page where numbering is honest because a run genuinely happens in
 * that order. The hero was the same argument told worse: one panel at a time,
 * behind 400vh of scrolling, gated on a scroll position, and it made the page
 * say the same thing twice.
 *
 * So the hero keeps the part that was actually a hero — the claim nothing else
 * on the page makes — and hands the rest back to the section that was already
 * telling it properly. What was four viewports is now one, with no sticky
 * frame, no scroll listener, no cross-fade and no rail: the page scrolls the
 * way a page scrolls, and the scrollbar goes back to meaning how much is left.
 */
export function Hero() {
  return (
    <section className="grid items-center gap-10 py-12 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-12 lg:gap-16 lg:py-20">
      <div className="flex flex-col items-start gap-6">
        {/* One string, balanced, rather than authored line breaks. The breaks
            were written for a full-width column and survived into a half-width
            one, where they wrapped inside themselves and left "Physical AI is"
            hanging on its own line. Balance holds at every width instead of
            looking right at one. */}
        <h1 className="text-balance font-display text-[clamp(2.4rem,5.2vw,4rem)] font-700 leading-[0.95] tracking-[-0.03em]">
          Physical AI is short of data, not compute.
        </h1>

        <p className="max-w-[54ch] text-[17px] leading-relaxed text-scribe-2">
          Robot manipulation data is collected in closed labs, slowly and
          narrowly. A model can only generalise across the situations somebody
          bothered to record.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/hub"
            className="border border-scribe bg-scribe px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
          >
            Find a task
          </Link>
          {/* Six steps through the loop, each one a live surface rather than a
              slide. Someone seeing this for the first time gets the argument in
              the order it makes sense in. */}
          <Link
            href="/hub?tour=1"
            className="border border-rule-strong px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-scribe transition-colors hover:border-scribe"
          >
            Show me the loop
          </Link>
        </div>

        <p className="font-mono text-[13px] leading-relaxed text-scribe-3">
          No hardware. No GPU. A browser and a wallet.
        </p>
      </div>

      <ArmFrame />
    </section>
  );
}

function ArmFrame() {
  return (
    <div className="relative h-[320px] border border-rule bg-ink-0 sm:h-[400px] md:h-[440px] lg:h-[540px]">
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
