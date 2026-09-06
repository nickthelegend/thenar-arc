import Link from "next/link";
import dynamic from "next/dynamic";
import { DimRule } from "@/components/primitives";
import { NetworkStats } from "@/components/network-stats";
import { LandingMotion } from "@/components/landing-motion";
import { IconArm, IconDatum, IconTally, IconWallet } from "@/components/icons";
import { TOLERANCE_MM } from "@/lib/score";

const HeroArm = dynamic(() => import("@/components/hero-arm").then((m) => m.HeroArm));

export default function Home() {
  return (
    <div className="mx-auto max-w-[1400px] px-5">
      <LandingMotion />
      {/* The thesis is the arm doing the work, next to the sentence that
          explains why anyone would. */}
      <section className="grid items-center gap-8 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:py-20">
        <div className="flex flex-col gap-6">
          <h1 data-anim="hero-head" className="font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-700 leading-[0.94] tracking-[-0.02em]">
            Physical AI is short of data,
            <br />
            not compute.
          </h1>

          <p className="max-w-[58ch] text-[16px] leading-relaxed text-scribe-2">
            Robot manipulation data is collected in closed labs, slowly and
            narrowly. Thenar collects it in the browser instead: you drive a
            simulated arm through a task, the run is measured against the goal
            datum, and if it passes, Monad records the trajectory and pays you
            in the same transaction.
          </p>

          <div data-anim="hero-cta" className="flex flex-wrap items-center gap-3">
            <Link
              href="/hub"
              className="border border-scribe bg-scribe px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
            >
              Find a task
            </Link>
            <Link
              href="/foundry"
              className="border border-rule-strong px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-scribe transition-colors hover:border-scribe"
            >
              See a cap table
            </Link>
          </div>

          <p className="font-mono text-[13px] leading-relaxed text-scribe-3">
            No hardware. No GPU. A browser and a wallet.
          </p>
        </div>

        <div className="relative h-[340px] border border-rule bg-ink-0 sm:h-[440px] lg:h-[520px]">
          <HeroArm />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule bg-ink-1/90 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">
            <span>THENAR-6</span>
            <span>6 revolute axes</span>
            <span>parallel jaw, 42 mm</span>
            <Link href="/spec" className="text-signal transition-colors hover:text-signal-hi">
              generated from cad/arm.py →
            </Link>
          </div>
        </div>
      </section>

      <NetworkStats />

      {/* The wedge, argued rather than asserted. */}
      <section className="grid gap-8 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-600 leading-[1.04] tracking-[-0.015em]">
          Everyone else anchors a receipt.
          <br />
          We settle the money.
        </h2>

        <div className="flex flex-col gap-5 text-[16px] leading-relaxed text-scribe-2">
          <p>
            The networks already doing this write one small record per
            trajectory — a data ID bound to a task and a wallet — and keep the
            economics off chain: points, non-transferable, settled by hand every
            fortnight, redeemable for a possible future airdrop. The largest of
            them has written more than 3.5 million of those records.
          </p>
          <p>
            Thenar writes the payment instead. A task is an escrow. An accepted
            trajectory pays out in the call that records it. A policy is minted
            with its contributor list attached, so a licence fee splits to
            everyone who trained it without anyone claiming anything. All of it
            is live on Monad Testnet — the figures above are read from the
            contract, not from a fixture.
          </p>
          <p className="text-scribe">
            That is several times the state writes of a bare anchor, and those
            writes barely touch each other — different operators, different
            tasks, one shared slot counter. It is the workload parallel
            execution exists for, which is the whole reason this is on Monad.
          </p>
        </div>
      </section>

      <DimRule />

      {/* The loop, as an ordered sequence — the one place numbering is honest,
          because a run genuinely happens in this order. */}
      <section className="py-14">
        <h2 className="max-w-[20ch] font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-600 leading-[1.04] tracking-[-0.015em]">
          One run, start to payment.
        </h2>

        <ol className="mt-10 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              Icon: IconArm,
              h: "Drive the arm",
              p: "Drag the workspace, or use WASD to reach and swing and E and Q to raise and lower. Space works the jaws. The pose is logged twenty times a second.",
            },
            {
              n: "02",
              Icon: IconDatum,
              h: "Come to rest",
              p: `The measurement is taken when the payload settles — how far its centre finished from the goal datum, against a ±${TOLERANCE_MM} mm band.`,
            },
            {
              n: "03",
              Icon: IconTally,
              h: "Get a score",
              p: "Placement, path smoothness and time against par resolve to one number. The same trajectory always scores the same, because the payout is derived from it.",
            },
            {
              n: "04",
              Icon: IconWallet,
              h: "Get paid",
              p: "One transaction records the trajectory hash, its task, your address and the score — and transfers the MON. There is no separate signing step.",
            },
          ].map((s) => (
            <li key={s.n} data-anim="step" className="flex flex-col gap-2 bg-ink-1 p-5">
              <span className="flex items-center gap-2.5">
                <s.Icon className="size-[18px] shrink-0 text-signal" />
                <span className="font-mono text-[12px] tabular-nums text-signal">{s.n}</span>
              </span>
              <h3 className="font-display text-lg font-600">{s.h}</h3>
              <p className="text-[14px] leading-relaxed text-scribe-2">{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      <DimRule />

      <section className="flex flex-col items-start gap-6 py-14 lg:py-20">
        <h2 className="max-w-[24ch] font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-600 leading-[1.04] tracking-[-0.015em]">
          There is work open right now.
        </h2>
        <p className="max-w-[56ch] text-[16px] leading-relaxed text-scribe-2">
          Pick a task, run it once, and watch the measurement land. If it passes,
          the MON is in your wallet before you have let go of the keyboard.
        </p>
        <Link
          href="/hub"
          className="border border-scribe bg-scribe px-5 py-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Open the hub
        </Link>
      </section>

      <footer className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-rule py-6 font-mono text-[12px] text-scribe-3">
        <span className="text-scribe-2">THENAR</span>
        <span>Monad Testnet · chain 10143</span>
        <Link href="/spec" className="hover:text-scribe">THENAR-6 spec sheet</Link>
        <a href="/api/contract" className="hover:text-scribe">Contract ABI</a>
        <a href="/api/health" className="hover:text-scribe">Health</a>
        <span className="ml-auto">Built at Monad Blitz Hyderabad</span>
      </footer>
    </div>
  );
}
