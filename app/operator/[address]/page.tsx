"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { DimRule } from "@/components/primitives";
import { addressUrl, txUrlOn, appChain, CURRENCY } from "@/lib/chain";
import { fmtInt, fmtMon, fmtScore, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

type Run = {
  traj_hash: string; task_id: number; score: number;
  deviation_mm: number; duration_s: number; created_at: number;
  tx_hash: string | null;
};
type Settlement = {
  txHash: string; method: string; succeeded: boolean; at: number; feeAvax: number;
};

/**
 * Everything one address has recorded, in one place.
 *
 * The leaderboard says who is ahead and the portfolio needs the operator's own
 * wallet connected. Neither lets you look up a contributor — which is what a
 * buyer does when deciding whether a corpus is worth paying for, and what a
 * contributor does when they want a link to their own work. Both halves are
 * public: the runs from the ledger, the calls from Avalanche's index.
 */
export default function OperatorPage() {
  const { address } = useParams<{ address: string }>();
  const valid = typeof address === "string" && isAddress(address);

  const [runs, setRuns] = useState<Run[] | null>(null);
  const [calls, setCalls] = useState<Settlement[] | null>(null);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    fetch(`/api/feed?limit=50`)
      .then((r) => r.json())
      .then((d: { runs: (Run & { contributor: string })[] }) => {
        if (live) setRuns(d.runs.filter((r) => r.contributor.toLowerCase() === address.toLowerCase()));
      })
      .catch(() => { if (live) setRuns([]); });

    fetch(`/api/glacier/${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { settlements: Settlement[] }) => { if (live) setCalls(d.settlements); })
      .catch(() => { if (live) setCalls([]); });

    return () => { live = false; };
  }, [address, valid]);

  if (!valid) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">Not an address</h1>
        <p className="mt-2 text-scribe-2">&ldquo;{String(address)}&rdquo; is not a 20-byte address.</p>
        <Link href="/leaderboard" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the standings
        </Link>
      </div>
    );
  }

  const accepted = runs ?? [];
  const best = accepted.length ? Math.max(...accepted.map((r) => r.score)) : 0;
  const mean = accepted.length ? accepted.reduce((n, r) => n + r.score, 0) / accepted.length : 0;
  const gas = (calls ?? []).reduce((n, c) => n + c.feeAvax, 0);
  const reverted = (calls ?? []).filter((c) => !c.succeeded).length;

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <span className="label">Operator</span>
      <h1 className="mt-1 break-all font-mono text-2xl text-scribe">{address}</h1>
      <a href={addressUrl(address)} target="_blank" rel="noreferrer"
         className="mt-2 inline-block font-mono text-[12px] text-scribe-3 hover:text-probe">
        on {appChain.blockExplorers.default.name} &rarr;
      </a>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <Reading label="Accepted runs" value={runs === null ? "—" : fmtInt(accepted.length)} />
        <Reading label="Best score" value={best ? fmtScore(best) : "—"} />
        <Reading label="Mean score" value={accepted.length ? fmtScore(Math.round(mean)) : "—"} />
        <Reading label="Protocol calls" value={calls === null ? "—" : fmtInt(calls.length)} />
        <Reading label="Reverted" value={calls === null ? "—" : fmtInt(reverted)} tone={reverted ? "reject" : undefined} />
        <Reading label="Gas paid" value={calls === null ? "—" : gas.toFixed(9)} unit={CURRENCY} />
      </div>

      <DimRule className="mt-8" note="Accepted runs" />
      {runs === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : accepted.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-3">
          Nothing recorded against this address on {appChain.name}.
        </p>
      ) : (
        <ol className="mt-2">
          {accepted.map((r) => (
            <li key={r.traj_hash} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(64px,auto))_auto]">
              <Link href={`/run/${r.traj_hash}`} className="truncate font-mono text-[13px] text-scribe hover:text-signal">
                {shortHash(r.traj_hash)}
              </Link>
              <span className="hidden font-mono text-[12px] tabular-nums text-scribe-3 sm:block">task {r.task_id}</span>
              <span className="hidden font-mono text-[13px] tabular-nums text-scribe-2 sm:block">{fmtScore(r.score)}</span>
              <span className="hidden font-mono text-[12px] tabular-nums text-scribe-3 sm:block">{r.deviation_mm.toFixed(1)} mm</span>
              {r.tx_hash ? (
                <a href={txUrlOn(appChain.id, r.tx_hash)} target="_blank" rel="noreferrer"
                   className="font-mono text-[12px] text-scribe-3 hover:text-probe">
                  {shortHash(r.tx_hash)} &rarr;
                </a>
              ) : <span className="font-mono text-[12px] text-scribe-3">&mdash;</span>}
            </li>
          ))}
        </ol>
      )}

      <DimRule className="mt-10" note="Every call, from Avalanche's index" />
      <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
        Including the ones that reverted, which a ledger of accepted runs by
        definition cannot show.
      </p>
      {calls === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : calls.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-3">No calls to the protocol from this address.</p>
      ) : (
        <ol className="mt-2">
          {calls.map((c) => (
            <li key={c.txHash} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))]">
              <span className="truncate font-mono text-[13px] text-scribe">{c.method}</span>
              <span className="hidden font-mono text-[12px] tabular-nums text-scribe-3 sm:block">{new Date(c.at).toLocaleDateString()}</span>
              <span className={cn("font-mono text-[12px] uppercase tracking-[0.12em]", c.succeeded ? "text-scribe-3" : "text-reject")}>
                {c.succeeded ? "ok" : "reverted"}
              </span>
              <a href={txUrlOn(appChain.id, c.txHash)} target="_blank" rel="noreferrer"
                 className="font-mono text-[12px] text-scribe-3 hover:text-probe">
                {c.txHash.slice(0, 10)}&hellip; &rarr;
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Reading({ label, value, unit, tone }: {
  label: string; value: string; unit?: string; tone?: "reject";
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] tabular-nums", tone === "reject" ? "text-reject" : "text-scribe")}>
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}
