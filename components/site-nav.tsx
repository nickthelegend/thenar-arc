"use client";

import Link from "next/link";
import { usePath } from "@/lib/use-path";
import { useBlockNumber } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ThenarWordmark } from "@/components/brand";
import { useSession } from "@/components/session";
import { addressUrl, IS_DEPLOYED, CURRENCY, appChain } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";
import { APP_HOME } from "@/lib/site";

/**
 * Every page, in three groups a person can read.
 *
 * Ten sections in a row, named after the protocol's own nouns ("Floor",
 * "Foundry", "Labs"), made the site read as a control panel: the words meant
 * nothing to someone who came to do a task, and the row ran off the edge.
 * Grouped by what a visitor came for, with a line saying what each page is,
 * nothing is removed and everything is findable.
 */
const GROUPS: { label: string; items: { href: string; label: string; hint: string }[] }[] = [
  {
    label: "Earn",
    items: [
      { href: "/start", label: "Start earning", hint: "Five steps to your first paid run" },
      { href: "/hub", label: "Find a task", hint: "Do a task with a robot arm and get paid" },
      { href: "/post", label: "Post a task", hint: "Fund a task for others to record" },
      { href: "/portfolio", label: "My earnings", hint: "Your runs and what they paid" },
      { href: "/leaderboard", label: "Top operators", hint: "Who has earned the most" },
      { href: "/passkey", label: "Your passkey", hint: "The one-time step before you can earn" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/corpus", label: "Buy the data", hint: "Every recorded run, ready for training" },
      { href: "/agents", label: "For AI agents", hint: "Agents pay per task, in USDC on Monad" },
      { href: "/corpus-token", label: "Owner shares", hint: "People who record the data own it" },
      { href: "/inventory", label: "Object library", hint: "Every object and room a task can use" },
      { href: "/space", label: "Live floor", hint: "Who is working on what, right now" },
    ],
  },
  {
    label: "Protocol",
    items: [
      { href: "/lab", label: "Labs", hint: "A research lab's budget, spent only on tasks" },
      { href: "/foundry", label: "Model foundry", hint: "Models trained on the data, and who gets paid" },
      { href: "/spec/so101", label: "The arms", hint: "The SO-101 and the THENAR-6, drivable" },
      { href: "/network", label: "Monad, live", hint: "Blocks, staking, precompiles, read as you watch" },
      { href: "/contracts", label: "Contracts", hint: "Every contract on Monad, read live" },
      { href: "/status", label: "Status", hint: "Is everything working" },
      { href: "/changelog", label: "Changelog", hint: "What changed, from the git history" },
    ],
  },
];

const inGroup = (pathname: string | null, g: (typeof GROUPS)[number]) =>
  g.items.some((i) => pathname === i.href || pathname?.startsWith(`${i.href}/`) || (i.href === "/spec/so101" && pathname === "/spec"));

export function SiteNav({ force = false }: { force?: boolean } = {}) {
  const pathname = usePath();
  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true, query: { enabled: IS_DEPLOYED } });

  // Which menu is open: a group label, "all" for the phone menu, or none.
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Hooks above, early returns below: a hook after a conditional return is a
  // hook that does not always run. The company pages and the app's home carry
  // their own nav, and the station is a full-screen instrument.
  // The app's home renders this nav itself (force): on app.thenar.io its path
  // is "/", the same as the company's home, which carries its own.
  if (!force && (pathname === "/" || pathname === "/thenar" || pathname?.startsWith("/products"))) return null;
  if (pathname?.startsWith("/station/")) return null;

  const item = (i: (typeof GROUPS)[number]["items"][number]) => {
    const active = pathname === i.href || pathname?.startsWith(`${i.href}/`);
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={() => setOpen(null)}
        aria-current={active ? "page" : undefined}
        className={cn("flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors duration-300 hover:bg-white/5", active && "bg-white/5")}
      >
        <span className={cn("text-sm", active ? "text-signal" : "text-white")}>{i.label}</span>
        <span className="text-xs text-scribe-3">{i.hint}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div ref={bar} className="glass relative mx-auto flex h-14 backdrop-blur-xl backdrop-saturate-150 max-w-[1200px] items-center gap-3 rounded-2xl px-4 sm:gap-6 sm:px-5">
          <Link href={APP_HOME} className="flex shrink-0 items-center" aria-label="Thenar home">
            <ThenarWordmark />
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 sm:flex" aria-label="Sections">
            {GROUPS.map((g) => (
              <div key={g.label} className="relative">
                <button
                  type="button"
                  aria-expanded={open === g.label}
                  aria-haspopup="true"
                  onClick={() => setOpen(open === g.label ? null : g.label)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                    inGroup(pathname, g) || open === g.label ? "text-white" : "text-scribe-2 hover:text-white",
                  )}
                >
                  {g.label}
                  <svg aria-hidden viewBox="0 0 10 6" className={cn("size-2.5 transition-transform duration-300", open === g.label && "rotate-180")}>
                    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                {inGroup(pathname, g) ? <span aria-hidden className="pointer-events-none absolute inset-x-3 -bottom-[9px] h-px bg-signal" /> : null}
                {open === g.label ? (
                  <div className="absolute left-1/2 top-full z-50 mt-3 w-[300px] -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-1/95 p-2 shadow-2xl backdrop-blur-xl">
                    {g.items.map(item)}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          <button
            type="button"
            aria-expanded={open === "all"}
            onClick={() => setOpen(open === "all" ? null : "all")}
            className="flex flex-1 items-center justify-start text-sm text-scribe-2 sm:hidden"
          >
            Menu {open === "all" ? "✕" : ""}
          </button>
          {open === "all" ? (
            <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-1/95 p-2 backdrop-blur-xl sm:hidden">
              {GROUPS.map((g) => (
                <div key={g.label} className="py-1">
                  <span className="block px-3 pt-2 text-xs text-scribe-3">{g.label}</span>
                  {g.items.map(item)}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-scribe-3 xl:flex">
              <span aria-hidden className="size-1.5 rounded-full bg-go" />
              {appChain.name}
              {block ? (
                <span className="tabular-nums text-scribe-2" title="Latest block">
                  #{block.toString()}
                </span>
              ) : null}
            </span>

            {s.connected ? (
              <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
                <span className="flex items-center px-3 py-1.5 font-mono text-xs tabular-nums text-signal">
                  {fmtMon(s.balance, 3)}
                  <span className="ml-1 text-scribe-3">{CURRENCY}</span>
                </span>
                <a
                  href={s.address ? addressUrl(s.address) : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden border-l border-white/10 px-3 py-1.5 font-mono text-xs text-scribe-2 transition-colors hover:text-white sm:flex"
                  title="View on the explorer"
                >
                  {s.address ? shortHash(s.address) : ""}
                </a>
                <button
                  onClick={() => s.disconnect()}
                  className="border-l border-white/10 px-2.5 py-1.5 text-xs text-scribe-3 transition-colors hover:text-reject"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={s.connect}
                disabled={s.connecting}
                className="rounded-lg bg-lilac px-4 py-2 text-sm font-semibold text-black transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98] disabled:opacity-60"
              >
                {s.connecting ? "Signing in…" : "Sign in"}
              </button>
            )}
          </div>
        </div>
      </header>

      {!IS_DEPLOYED ? (
        <Banner tone="reject">
          No contract address is configured. Set <code>NEXT_PUBLIC_AXON_ADDRESS</code> and restart.
        </Banner>
      ) : null}

      {s.connectError && !s.connected ? (
        <Banner tone="reject">
          That wallet refused the connection. Unlock it and try again.
        </Banner>
      ) : null}
    </>
  );
}

function Banner({ tone, children }: { tone: "reject" | "signal"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "mx-auto mt-3 flex max-w-[1200px] flex-wrap items-center gap-y-1 rounded-xl border px-5 py-2 text-sm",
        tone === "reject"
          ? "border-reject bg-reject-dim text-reject"
          : "border-signal bg-signal-dim text-signal",
      )}
    >
      {children}
    </div>
  );
}
