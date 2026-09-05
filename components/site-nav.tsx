"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { cn } from "@/lib/cn";
import { AxonWordmark } from "@/components/brand";
import { useSession } from "@/components/session";
import { addressUrl, IS_DEPLOYED } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";

const ROUTES = [
  { href: "/hub", label: "Hub" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/foundry", label: "Foundry" },
  { href: "/passkey", label: "Passkey" },
];

/** Enough MON to cover gas on a submit with headroom. */
const LOW_BALANCE = 0.02;

export function SiteNav() {
  const pathname = usePathname();
  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true, query: { enabled: IS_DEPLOYED } });

  if (pathname?.startsWith("/station/")) return null;

  const lowOnGas = s.connected && !s.wrongNetwork && s.balance < LOW_BALANCE;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule bg-ink-1/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-stretch gap-3 px-4 sm:gap-6 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center self-center" aria-label="Axon home">
            <AxonWordmark />
          </Link>

          <nav
            className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    "flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-mono text-[12px] font-medium uppercase tracking-[0.14em] transition-colors sm:px-4",
                    active
                      ? "border-signal text-scribe"
                      : "border-transparent text-scribe-3 hover:text-scribe-2",
                  )}
                >
                  {r.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <span className="hidden items-baseline gap-2 font-mono text-[12px] text-scribe-3 xl:flex">
              Monad Testnet
              {block ? (
                <span className="text-scribe-2 tabular-nums" title="Latest block">
                  #{block.toString()}
                </span>
              ) : null}
            </span>

            {s.connected ? (
              <div className="flex items-stretch border border-rule-strong">
                <span className="flex items-center border-r border-rule-strong px-2.5 font-mono text-[12px] tabular-nums text-signal sm:px-3">
                  {fmtMon(s.balance, 3)}
                  <span className="ml-1 text-[12px] text-scribe-3">MON</span>
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

      {s.wrongNetwork ? (
        <Banner tone="reject">
          Your wallet is on the wrong network. Axon settles on Monad Testnet.
          <button
            onClick={s.switchToMonad}
            disabled={s.switching}
            className="ml-3 border border-current px-2.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors hover:bg-reject hover:text-ink-0 disabled:opacity-60"
          >
            {s.switching ? "Switching…" : "Switch to Monad"}
          </button>
        </Banner>
      ) : null}

      {lowOnGas ? (
        <Banner tone="signal">
          Balance is {fmtMon(s.balance, 4)} MON — not much runway for gas.
          <a
            href="https://faucet.monad.xyz"
            target="_blank"
            rel="noreferrer"
            className="ml-3 border border-current px-2.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors hover:bg-signal hover:text-ink-0"
          >
            Open the faucet
          </a>
        </Banner>
      ) : null}

      {s.connectError && !s.connected ? (
        <Banner tone="reject">
          {s.hasWallet
            ? "That wallet refused the connection. Unlock it and try again."
            : "No browser wallet found. Install MetaMask, or any injected wallet, to submit runs."}
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
