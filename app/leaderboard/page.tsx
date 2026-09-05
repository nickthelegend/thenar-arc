"use client";

import { DimRule } from "@/components/primitives";
import { useLeaderboard } from "@/lib/hooks";
import { useSession } from "@/components/session";
import { addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtInt, fmtMon, fmtScore, shortHash } from "@/lib/format";

export default function LeaderboardPage() {
  const { standings, isLoading, isError } = useLeaderboard();
  const { address } = useSession();

  const totalRuns = standings.reduce((n, o) => n + o.runs, 0);
  const totalPaid = standings.reduce((n, o) => n + o.earned, 0);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Operators</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        Every accepted run on this contract, read back from its trajectory ledger.
        Nothing here is a fixture — an address appears the moment its first run is paid.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Operators</span>
          <span className="font-mono text-[15px] tabular-nums">{fmtInt(standings.length)}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Runs</span>
          <span className="font-mono text-[15px] tabular-nums">{fmtInt(totalRuns)}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Paid out</span>
          <span className="font-mono text-[15px] tabular-nums text-brass">
            {fmtMon(totalPaid, 4)} <span className="text-[12px] text-scribe-3">MON</span>
          </span>
        </span>
      </div>

      <DimRule className="mt-6" />

      {isError ? (
        <p className="mt-6 text-[14px] text-scribe-3">
          This RPC would not serve the event log. The standings are unavailable, the chain is fine.
        </p>
      ) : isLoading ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : standings.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">Nobody has been paid yet.</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-scribe-3">
            The first operator to complete a run and submit it will take rank 01.
          </p>
        </div>
      ) : (
        <ol className="mt-2">
          {standings.map((o) => {
            const you = address?.toLowerCase() === o.address.toLowerCase();
            return (
              <li
                key={o.address}
                className={cn(
                  "grid grid-cols-[36px_1fr_auto] items-center gap-4 border-b border-rule py-3.5 sm:grid-cols-[36px_1fr_repeat(4,minmax(64px,auto))]",
                  you && "bg-brass-dim",
                )}
              >
                <span className="font-mono text-[15px] tabular-nums text-scribe-3">
                  {String(o.rank).padStart(2, "0")}
                </span>
                <a
                  href={addressUrl(o.address)}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("truncate font-mono text-[13px] hover:text-datum", you ? "text-brass" : "text-scribe")}
                >
                  {shortHash(o.address)}{you ? " · you" : ""}
                </a>
                <Cell label="Runs" value={fmtInt(o.runs)} />
                <Cell label="Mean" value={fmtScore(o.meanScore)} className="hidden sm:flex" />
                <Cell label="Tasks" value={String(o.tasks)} className="hidden sm:flex" />
                <Cell label="Earned" value={fmtMon(o.earned, 4)} tone="brass" className="hidden sm:flex" />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Cell({ label, value, tone, className = "" }: { label: string; value: string; tone?: "brass"; className?: string }) {
  return (
    <span className={`flex flex-col items-end gap-0.5 ${className}`}>
      <span className="label">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums ${tone === "brass" ? "text-brass" : "text-scribe"}`}>{value}</span>
    </span>
  );
}
