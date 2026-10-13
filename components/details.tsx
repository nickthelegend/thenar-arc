"use client";

import { cn } from "@/lib/cn";

/**
 * Where a card's fine print lives: collapsed, one tap away.
 *
 * The main view carries one headline and one short line (the readability
 * rule); method, caveats, block numbers and hashes stay reachable here for
 * anyone who wants to check them.
 */
export function Details({ children, className, label = "Details" }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <details className={cn("group text-xs text-scribe-3", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-scribe-3 transition-colors hover:text-scribe-2">
        {label} <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 leading-relaxed">{children}</div>
    </details>
  );
}

/** A small honesty label: "local chain", "live", "testnet". */
export function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "go" | "signal" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px]",
      tone === "go" ? "border-go/40 text-go" : tone === "signal" ? "border-signal/40 text-signal" : "border-white/15 text-scribe-3",
    )}>{children}</span>
  );
}
