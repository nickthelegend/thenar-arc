"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ThenarWordmark } from "@/components/brand";
import { useSession } from "@/components/session";
import { addressUrl, IS_DEPLOYED, CURRENCY, appChain } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";

const ROUTES = [
  { href: "/hub", label: "Hub" },
  { href: "/agents", label: "Agents" },
  { href: "/corpus-token", label: "Shares" },
  { href: "/lab", label: "Labs" },
  { href: "/space", label: "Floor" },
  { href: "/inventory", label: "Inventory" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/foundry", label: "Foundry" },
  { href: "/contracts", label: "Contracts" },
];

export function SiteNav() {
  const pathname = usePathname();

  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true, query: { enabled: IS_DEPLOYED } });

  /**
   * Whether the sections actually run past the edge.
   *
   * The fade used to be switched off at `md`, on the assumption that by 768px
   * they all fit. They do not: at 789px there were still 157px of sections past
   * the edge and, with the fade gone, nothing saying so — "Leaderboard" was cut
   * through the middle against a hard edge and "Foundry" was off the end
   * entirely. The bar scrolled; nothing suggested it could.
   *
   * A breakpoint was the wrong instrument. The row overflows when its contents
   * are wider than it is, and that depends on the wallet chip and the block
   * number beside it as much as on the viewport — so it is measured rather than
   * predicted, and the fade is on exactly when there is somewhere to scroll to.
   *
   * Declared above the station early-return below, because a hook after a
   * conditional return is a hook that does not always run.
   */
  const scroller = useRef<HTMLElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  /**
   * One underline that moves, rather than a border on whichever item is active.
   *
   * A border-bottom per item means the mark under the current section vanishes
   * and reappears somewhere else — the eye has nothing to follow and the bar
   * reads as two unrelated states. A single rule that travels says the same
   * thing and says where it came from, which is the whole difference between a
   * change and a transition.
   *
   * Measured rather than laid out: the items are different widths and the row
   * scrolls, so the only reliable geometry is the active element's own box,
   * read after layout. It is re-measured when the route changes, when the row
   * resizes, and when a font swap changes the measure of the words in it.
   */
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const row = scroller.current;
    if (!row) return;
    const place = () => {
      const active = row.querySelector<HTMLElement>("[aria-current='page']");
      if (!active) return setMark(null);
      setMark({ left: active.offsetLeft, width: active.offsetWidth });
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(place);
    ro.observe(row);
    for (const child of Array.from(row.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [pathname]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // The links carry the width, so a font swap changing their measure has to
    // re-check too — not only the bar being resized around them.
    for (const child of Array.from(el.children)) ro.observe(child);
    check();
    return () => ro.disconnect();
  }, [pathname]);

  // Below the hooks, with the station's, for the reason the note above gives:
  // a hook after a conditional return is a hook that does not always run.
  //
  // The landing page carries its own nav — a different structure, a different
  // palette, and a brand lockup sized to a poster rather than to an app bar.
  // Rendering both would stack two fixed headers on top of one another.
  if (pathname === "/") return null;
  if (pathname?.startsWith("/station/")) return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule bg-ink-1">
        <div className="mx-auto flex h-14 max-w-[1400px] items-stretch gap-3 px-4 sm:gap-6 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center self-center" aria-label="Thenar home">
            <ThenarWordmark />
          </Link>

          <nav
            ref={scroller}
            /* The scrollbar is hidden, so the sections past the edge have
               nothing saying they are there. The mask fades the last few pixels,
               which is the only cue a horizontal scroll gets once the bar itself
               is gone — on while there is somewhere to scroll to, off when the
               row fits and a fade would only dim the last item for no reason. */
            className={cn(
              "relative flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              overflowing &&
                "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]",
            )}
            aria-label="Sections"
          >
            {ROUTES.map((r) => {
              const active = pathname === r.href || pathname?.startsWith(`${r.href}/`);
              return (
                <Link
                  key={r.href}
                  href={r.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center whitespace-nowrap px-3 font-mono text-[12px] font-medium uppercase tracking-[0.14em] transition-colors sm:px-4",
                    active ? "text-scribe" : "text-scribe-3 hover:text-scribe-2",
                  )}
                >
                  {r.label}
                </Link>
              );
            })}

            {/* Drawn once, moved rather than redrawn. `motion-safe` is the whole
                reduced-motion story here: with motion reduced it still lands in
                the right place, it just arrives there without the journey. */}
            {mark ? (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-0 h-[2px] bg-signal motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(${mark.left}px)`, width: mark.width }}
              />
            ) : null}
          </nav>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <span className="hidden items-baseline gap-2 font-mono text-[12px] text-scribe-3 xl:flex">
              {appChain.name}
              {block ? (
                <span className="text-scribe-2 tabular-nums" title="Latest block">
                  #{block.toString()}
                </span>
              ) : null}
            </span>

            <ThemeToggle />

            {s.connected ? (
              <div className="flex items-stretch border border-rule-strong">
                <span className="flex items-center border-r border-rule-strong px-2.5 font-mono text-[12px] tabular-nums text-signal sm:px-3">
                  {fmtMon(s.balance, 3)}
                  <span className="ml-1 text-[12px] text-scribe-3">{CURRENCY}</span>
                </span>
                <a
                  href={s.address ? addressUrl(s.address) : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center px-3 font-mono text-[12px] text-scribe-2 transition-colors hover:text-scribe sm:flex"
                  title="View on the explorer"
                >
                  {s.address ? shortHash(s.address) : ""}
                </a>
                <button
                  onClick={() => s.disconnect()}
                  className="border-l border-rule-strong px-2.5 font-mono text-[12px] uppercase tracking-[0.1em] text-scribe-3 transition-colors hover:text-reject"
                  title="Disconnect"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={s.connect}
                disabled={s.connecting}
                className="border border-scribe bg-scribe px-4 py-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
              >
                {s.connecting ? "Connecting…" : "Connect"}
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
        "flex flex-wrap items-center gap-y-1 border-b px-5 py-2 text-[13px]",
        tone === "reject"
          ? "border-reject bg-reject-dim text-reject"
          : "border-signal bg-signal-dim text-signal",
      )}
    >
      {children}
    </div>
  );
}
