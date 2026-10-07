import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { LabsNav } from "@/components/labs/labs-nav";
import { LabsFooter } from "@/components/labs/labs-footer";
import { Reveal } from "@/components/labs/reveal";
import { Tagline } from "@/components/labs/tagline";
import { HeroVideo } from "@/components/labs/hero-video";
import { BuiltWith } from "@/components/labs/built-with";
import { appChain } from "@/lib/chain";
import { openTasks } from "@/lib/server/open-tasks";
import { PRODUCTS } from "@/lib/products";
import { APP_HOME, appHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "ThenarLabs — we build physical AI",
  description:
    "ThenarLabs builds robots you can print, the teleoperation that drives them, and Thenar: where people are paid on Monad for every run they record.",
};

// Figures from the chain, at most five minutes old.
export const revalidate = 300;

async function monadFigures() {
  // The same reading as the app's home and the hub: open means taking runs now.
  const f = await openTasks();
  return f ? { tasks: f.tasks.length, escrow: f.escrowMon, open: f.slotsLeft } : null;
}

const STEPS = [
  {
    n: "01",
    title: "Drive",
    body: "Take a task and do it with a robot arm: from the browser, a Meta Quest 3S on your own table, or a leader arm in your hand.",
  },
  {
    n: "02",
    title: "Get paid",
    body: "A verifier measures the run and signs its score. One Monad transaction records it and pays you, in the block that holds it.",
  },
  {
    n: "03",
    title: "Train",
    body: "Every paid run issues your share of the corpus. Labs and AI agents buy it per task, and every sale is logged with its hash.",
  },
];

const FAQ = [
  {
    q: "What is ThenarLabs?",
    a: "A physical AI lab. We design robots anyone can print and build, the teleoperation rigs that drive them, and Thenar, the market where the people who teach robots are paid for it.",
  },
  {
    q: "Do I need a robot to earn on Thenar?",
    a: "No. Every task runs on a simulated arm at true scale in the browser or in a Meta Quest. A physical SO-101 leader or follower is optional: it drives the same recording.",
  },
  {
    q: "How are operators paid?",
    a: "In MON on Monad, by the same transaction that records the run, from escrow the task's funder put up front. The station shows the payout and what it cost to settle.",
  },
  {
    q: "What stops fake runs?",
    a: "A paid run needs a person behind the address: a passkey checked on chain through Monad's P-256 precompile. The verifier also rejects a recording whose arm never really carried the object.",
  },
  {
    q: "Who buys the data?",
    a: "Robotics labs and AI agents. An agent asks for a task's corpus over HTTP, pays a cent of USDC through x402, and checks the file against the sale logged on Monad.",
  },
  {
    q: "Is the hardware open source?",
    a: "Yes. Thenar Arms, JX1, JX0 and the Thenar Duck publish their CAD, print files, parts lists and firmware on GitHub. None of it is payload rated yet, and each repository says what has and has not been proven on a bench.",
  },
];

export default async function LabsHome() {
  const figures = await monadFigures();
  // The animated hero, once it exists; its first frame until then.
  const heroFilm = existsSync(path.join(process.cwd(), "public", "labs", "hero.mp4"));
  // Hardware with real pictures, then the app: what a visitor can hold, and where they can earn.
  const featured = ["arms", "hotaru", "jx1", "duck", "gt240", "thenar"]
    .map((id) => PRODUCTS.find((p) => p.id === id)!)
    .filter((p) => existsSync(path.join(process.cwd(), "public", p.images[0].src)));

  return (
    <div className="relative overflow-hidden bg-black text-white">
      <LabsNav />

      {/* Hero. The film (or its first frame) fills the section; the words sit in
          the black the render leaves above the arm. */}
      <section className="relative flex min-h-[100svh] flex-col items-center overflow-hidden px-4 text-center">
        <div className="relative z-10 pt-36 sm:pt-40">
          <Reveal fade>
            <h1 className="heading-glow mx-auto max-w-[680px] text-5xl font-medium leading-none tracking-tight sm:text-7xl">
              We build
              <br />
              physical AI
            </h1>
          </Reveal>
          <Reveal fade delay={150}>
            <p className="mx-auto mt-6 max-w-[560px] text-base text-scribe-2 sm:text-lg">
              Robots you can print, the rigs that drive them, and a market that pays people on Monad for every run they
              record.
            </p>
          </Reveal>
          <Reveal fade delay={300} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={APP_HOME}
              className="rounded-lg bg-lilac px-5 py-3 text-base font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]"
            >
              Record your first run
            </Link>
            <Link
              href="/products"
              className="rounded-lg border border-white/15 bg-white/[0.06] px-5 py-3 text-base font-medium text-white backdrop-blur-md transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.12] active:scale-[0.98]"
            >
              See what we build →
            </Link>
          </Reveal>
        </div>
        {/* The film sits under the words, never behind them: it used to start a
            fixed 38% down the screen, and on a short or narrow screen it slid up
            behind the subtitle and the second button. */}
        <div aria-hidden className="relative -mx-4 -mt-6 w-[calc(100%+2rem)] flex-1 min-h-[300px] sm:min-h-[440px] [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_80%,transparent)]">
          {heroFilm ? (
            <HeroVideo
              className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
              poster="/labs/hero-poster.webp"
              sources={[
                { src: "/labs/hero.webm", type: "video/webm" },
                { src: "/labs/hero.mp4", type: "video/mp4" },
              ]}
            />
          ) : (
            <Image src="/labs/hero.webp" alt="" fill priority sizes="100vw" className="object-cover object-[center_40%]" />
          )}
        </div>

        <Reveal delay={450} className="relative z-10 -mt-16 w-full max-w-[900px] pb-16">
          <p className="text-xs text-scribe-3">Built with</p>
          <BuiltWith />
        </Reveal>
      </section>

      {/* The statement. */}
      <section className="relative mx-auto max-w-[1100px] px-6 py-32">
        <Image src="/labs/crystal.webp" alt="" width={700} height={700} className="glass-art absolute -left-24 top-10 w-56 opacity-80 sm:w-72" />
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <p className="text-2xl font-medium text-white sm:text-3xl">Robots learn from people.</p>
          </Reveal>
          <div className="mt-10">
            <Tagline
              lines={[
                "Physical AI is starved of real demonstrations.",
                "ThenarLabs builds the robots, the rigs that drive them, and the market that *pays* *the* *people* who teach them.",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Products. */}
      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-scribe-3">What we build</p>
            <h2 className="mt-3 max-w-[560px] text-4xl font-medium tracking-tight sm:text-5xl">From the arm on your desk to the humanoid</h2>
          </div>
          <Link href="/products" className="text-sm text-scribe-2 transition-colors hover:text-white">All products →</Link>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 100} as="article">
              <Link
                href={`/products/${p.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0D] transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#111114]">
                  <Image
                    src={p.images[0].src}
                    alt={p.images[0].caption}
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <span className="self-start rounded-full border border-white/15 px-3 py-1 text-xs text-scribe-2">{p.status}</span>
                  <h3 className="mt-4 text-2xl font-medium">{p.name}</h3>
                  <p className="mt-2 text-sm text-scribe-2">{p.line}</p>
                  <span className="mt-auto pt-6 font-mono text-xs text-scribe-3 transition-colors group-hover:text-white">github.com/{p.repo} →</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How Thenar works. */}
      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <Reveal>
          <p className="text-sm text-scribe-3">How Thenar works</p>
          <h2 className="mt-3 max-w-[620px] text-4xl font-medium tracking-tight sm:text-5xl">A run is recorded, verified and paid in one block</h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} className="rounded-3xl border border-white/10 bg-[#0B0B0D] p-8">
              <span className="font-mono text-sm text-signal">{s.n}</span>
              <h3 className="mt-6 text-2xl font-medium">{s.title}</h3>
              <p className="mt-3 text-sm text-scribe-2">{s.body}</p>
            </Reveal>
          ))}
        </div>
        {figures ? (
          <Reveal className="mt-4 grid gap-4 rounded-3xl border border-white/10 bg-[#0B0B0D] p-8 sm:grid-cols-3">
            <Figure value={String(figures.tasks)} label={`funded tasks on ${appChain.name}`} />
            <Figure value={String(figures.open)} label="paid runs still open to anyone" />
            <Figure value={`${figures.escrow.toFixed(3)} MON`} label="in escrow, paid out per run" />
          </Reveal>
        ) : null}
      </section>

      {/* FAQ. */}
      <section className="mx-auto max-w-[900px] px-6 py-24">
        <Reveal>
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">Questions</h2>
        </Reveal>
        <div className="mt-10 divide-y divide-white/10 rounded-3xl border border-white/10 bg-[#0B0B0D]">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-8 py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium">
                {f.q}
                <span aria-hidden className="text-2xl font-light text-scribe-3 transition-transform duration-500 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[680px] text-sm text-scribe-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final action. */}
      <section className="relative mx-auto max-w-[1100px] px-6 pb-32 pt-12 text-center">
        <Image src="/labs/crystal.webp" alt="" width={700} height={700} className="glass-art mx-auto w-56 sm:w-72" />
        <Reveal fade>
          <h2 className="heading-glow mx-auto mt-6 max-w-[680px] text-4xl font-medium tracking-tight sm:text-6xl">Teach a robot today</h2>
          <p className="mx-auto mt-5 max-w-[520px] text-base text-scribe-2">
            Pick a funded task, drive the arm, and be paid on Monad before the page finishes telling you so.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href={appHref("/hub")}
              className="rounded-lg bg-lilac px-5 py-3 text-base font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]"
            >
              Record your first run
            </Link>
          </div>
        </Reveal>
      </section>

      <LabsFooter />
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-4xl font-medium tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-scribe-3">{label}</p>
    </div>
  );
}
