import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MonadPipeline } from "@/components/monad-pipeline";
import { Reveal } from "@/components/labs/reveal";
import { SiteNav } from "@/components/site-nav";
import { appChain } from "@/lib/chain";
import { openTasks } from "@/lib/server/open-tasks";
import { labsHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Thenar — teach a robot, get paid on Monad",
  description:
    "Pick a funded task, drive an SO-101 from your browser, a Meta Quest 3S or your own leader arm, and be paid on Monad in the transaction that records the run.",
};

export const revalidate = 60;

const WAYS = [
  {
    title: "In your browser",
    body: "Drag the arm or use W A S D and Space. Nothing to install.",
    img: "/products/thenar/station.webp",
    href: "/station/0",
    cta: "Open a station",
  },
  {
    title: "On a Meta Quest 3S",
    body: "Open any station in the Quest browser and press Enter on your table. The arm stands on your real desk.",
    img: "/products/thenar/station.webp",
    href: "/station/0",
    cta: "Try it in the headset",
  },
  {
    title: "With your leader arm",
    body: "Plug in a Thenar Arms leader: six AS5600 encoders on an ESP32. The arm on screen follows your hand, joint for joint.",
    img: "/products/arms/leader-render.webp",
    href: "/spec/so101",
    cta: "See the arm",
  },
];

const STEPS = [
  { n: "01", title: "Set up your passkey", body: "Once. Face ID, a fingerprint or a PIN; Monad checks it on chain, so paid runs come from a person." },
  { n: "02", title: "Do the task", body: "Pick the payload up and place it in the goal ring. The station measures the run as you finish." },
  { n: "03", title: "Get paid", body: "The verifier signs the score and one Monad transaction records the run and pays you. Your share of the corpus is issued a moment later." },
];

export default async function ThenarHome() {
  const figures = await openTasks();
  const tasks = figures?.tasks.filter((t) => t.accepting).slice(0, 6) ?? [];

  return (
    <div className="bg-black text-white">
      <SiteNav force />
      <section className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pb-16 pt-24 text-center">
        <Reveal fade>
          <p className="rounded-full border border-white/10 px-3 py-1 text-xs text-scribe-2">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-go align-middle" />
            Live on {appChain.name}
          </p>
        </Reveal>
        <Reveal fade delay={100}>
          <h1 className="heading-glow mx-auto mt-6 max-w-[760px] text-5xl font-medium leading-none tracking-tight sm:text-7xl">
            Teach a robot.
            <br />
            Get paid on Monad.
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="mx-auto mt-6 max-w-[580px] text-base text-scribe-2 sm:text-lg">
            Pick a funded task and drive the robot arm. The run is scored and paid in the same Monad transaction that
            records it, and every paid run makes you an owner of the data.
          </p>
        </Reveal>
        <Reveal delay={300} className="mt-8 flex flex-wrap justify-center gap-3">
          {/* One way in for a newcomer: the steps to a first paid run, each read live. */}
          <Link href="/start" className="rounded-lg bg-lilac px-5 py-3 text-base font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]">
            Start earning
          </Link>
          <Link href="/hub" className="rounded-lg border border-white/15 px-5 py-3 text-base text-white transition-colors duration-500 hover:bg-white/5">
            Browse tasks
          </Link>
        </Reveal>
        {figures ? (
          <Reveal delay={400} className="mt-14 grid w-full max-w-[860px] grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-[#0B0B0D]">
            <Figure value={String(figures.tasks.length)} label="funded tasks" />
            <Figure value={String(figures.slotsLeft)} label="paid runs open" />
            <Figure value={`${figures.escrowMon.toFixed(3)}`} label="MON in escrow" />
          </Reveal>
        ) : null}
        {/* Monad's pace, shown rather than claimed: the real testnet's blocks, live. */}
        <Reveal delay={500} className="mt-4 w-full max-w-[860px]">
          <MonadPipeline />
        </Reveal>
      </section>

      {tasks.length ? (
        <section className="mx-auto max-w-[1200px] px-6 py-16">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Open tasks</h2>
            <Link href="/hub" className="text-sm text-scribe-2 transition-colors hover:text-white">Every task →</Link>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t, i) => (
              <Reveal key={t.id} delay={(i % 3) * 80}>
                <Link
                  href={`/station/${t.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-white/10 bg-[#0B0B0D] p-6 transition-colors duration-500 hover:border-white/25"
                >
                  <div className="flex items-center justify-between text-xs text-scribe-3">
                    <span>Task {t.id}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5">{t.arm === "so101" ? "SO-101" : "THENAR-6 × 2"}</span>
                  </div>
                  <p className="mt-4 text-lg leading-snug">{t.instruction}</p>
                  <div className="mt-auto flex items-end justify-between pt-6">
                    <span>
                      <span className="text-2xl font-medium tabular-nums text-signal">{t.rewardMon}</span>
                      <span className="ml-1 text-sm text-scribe-3">MON a run</span>
                    </span>
                    <span className="text-sm text-scribe-3">{t.slotsLeft} of {t.slotsTotal} left</span>
                  </div>
                  <span className="mt-4 text-sm text-white transition-transform duration-500 group-hover:translate-x-1">Start →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <Reveal><h2 className="text-3xl font-medium tracking-tight sm:text-4xl">Three ways to drive</h2></Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {WAYS.map((w, i) => (
            <Reveal key={w.title} delay={i * 100}>
              <Link href={w.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0D] transition-colors duration-500 hover:border-white/25">
                <div className="relative aspect-[16/10] overflow-hidden bg-[#111114]">
                  <Image src={w.img} alt="" fill unoptimized sizes="400px" className="object-cover transition-transform duration-1000 group-hover:scale-[1.03]" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-xl font-medium">{w.title}</h3>
                  <p className="mt-2 text-sm text-scribe-2">{w.body}</p>
                  <span className="mt-auto pt-6 text-sm text-white">{w.cta} →</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <Reveal><h2 className="text-3xl font-medium tracking-tight sm:text-4xl">How you get paid</h2></Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 100} className="rounded-2xl border border-white/10 bg-[#0B0B0D] p-6">
              <span className="font-mono text-sm text-signal">{s.n}</span>
              <h3 className="mt-5 text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-sm text-scribe-2">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-28 pt-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-[#0B0B0D] p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-medium tracking-tight">Building an AI agent?</h2>
            <p className="mt-2 max-w-[560px] text-sm text-scribe-2">
              Agents buy a task&rsquo;s data over HTTP for a cent of USDC through x402, and check the file against the sale logged on Monad.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/agents" className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition-colors hover:bg-white/5">For AI agents</Link>
            <Link href={labsHref("/products")} className="rounded-lg px-4 py-2 text-sm text-scribe-2 transition-colors hover:text-white">ThenarLabs →</Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 py-5">
      <p className="text-3xl font-medium tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-scribe-3">{label}</p>
    </div>
  );
}
