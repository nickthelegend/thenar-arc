"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DimRule } from "@/components/primitives";
import { CURRENCY } from "@/lib/chain";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";

type Stats = {
  runs: number; passkeyRuns: number; operators: number; paidTotal: string;
  sales: number; paidSales: number; shareHolders: number; passkeys: number; subscriptions: number;
  tasks: number; tasksFilled: number; lastBlock: string; lastEventAt: string;
};
type Day = { id: string; dayStart: string; runs: number; paid: string; activeOperators: number; newOperators: number; sales: number };
type Operator = { id: string; runCount: number; passkeyRunCount: number; paidTotal: string; lastRunAt: string | null };
type Activity = { configured: boolean; local?: boolean; error?: string; stats?: Stats | null; days?: Day[]; recent?: Operator[] };

const DAY = 86_400;
const wei = (s: string) => Number(BigInt(s)) / 1e18;

/** Fourteen UTC days ending today, with the days nobody ran on drawn as zero. */
function fortnight(days: Day[]): Day[] {
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const byStart = new Map(days.map((d) => [Number(d.dayStart), d]));
  return Array.from({ length: 14 }, (_, i) => {
    const start = today - (13 - i) * DAY;
    return byStart.get(start) ?? {
      id: new Date(start * 1000).toISOString().slice(0, 10), dayStart: String(start),
      runs: 0, paid: "0", activeOperators: 0, newOperators: 0, sales: 0,
    };
  });
}

function ago(seconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < DAY) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / DAY)} d ago`;
}

/**
 * The network's history, as the Envio indexer holds it.
 *
 * The standings above read the protocol's own ledger. What they cannot show is
 * history: Monad's RPC serves logs 100 blocks at a time, so who ran on which
 * day, how many runs a passkey signed and how many corpora were sold are read
 * from the HyperIndex indexer in indexer/, through /api/indexer.
 */
export function IndexedActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ["indexer-activity"],
    queryFn: async (): Promise<Activity> => {
      const r = await fetch("/api/indexer");
      return (await r.json()) as Activity;
    },
    refetchInterval: 30_000,
  });

  // A deployment without an indexer says nothing rather than drawing zeros.
  if (isLoading || !data || !data.configured) return null;

  return (
    <section aria-labelledby="indexed-title" className="mt-10" data-testid="indexed-activity">
      <DimRule note="History, from the Envio indexer" />
      <h2 id="indexed-title" className="sr-only">History, from the Envio indexer</h2>
      {data.error ? (
        <div className="mt-4 border border-rule px-5 py-4" role="status">
          <p className="text-[14px] text-scribe-2">{data.error}</p>
          {data.local ? (
            <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
              The local indexer runs beside the chain. Start it with{" "}
              <code className="font-mono text-[12px] text-scribe">sh indexer/scripts/start.sh --bg</code>, and this
              history fills in as it catches up.
            </p>
          ) : null}
        </div>
      ) : !data.stats ? (
        <p className="mt-4 text-[14px] text-scribe-3">
          The indexer is running but has not seen an event on this chain yet. Post a task or record a run and it appears here.
        </p>
      ) : (
        <Indexed stats={data.stats} days={fortnight(data.days ?? [])} recent={data.recent ?? []} />
      )}
    </section>
  );
}

function Indexed({ stats, days, recent }: { stats: Stats; days: Day[]; recent: Operator[] }) {
  const peak = Math.max(1, ...days.map((d) => d.runs));
  const fortnightRuns = days.reduce((n, d) => n + d.runs, 0);
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 font-mono text-[13px]">
        <Figure label="Runs" value={fmtInt(stats.runs)} />
        <Figure label="Signed with a passkey" value={fmtInt(stats.passkeyRuns)} />
        <Figure label="Passkeys" value={fmtInt(stats.passkeys)} />
        <Figure label="Corpus sales" value={fmtInt(stats.sales)} />
        <Figure label="Shareholders" value={fmtInt(stats.shareHolders)} />
        <Figure label="Paid out" value={`${fmtMon(wei(stats.paidTotal), 4)} ${CURRENCY}`} />
      </div>

      <figure className="mt-5">
        <div className="flex h-28 items-end gap-1" role="img" aria-label={`${fortnightRuns} runs in the last 14 days`}>
          {days.map((d) => (
            <div
              key={d.id}
              title={`${d.id}: ${d.runs} ${d.runs === 1 ? "run" : "runs"}, ${d.activeOperators} ${d.activeOperators === 1 ? "operator" : "operators"} (${d.newOperators} new), ${d.sales} ${d.sales === 1 ? "sale" : "sales"}`}
              className={d.runs ? "flex-1 bg-signal" : "flex-1 bg-rule"}
              style={{ height: d.runs ? `${Math.max(6, (d.runs / peak) * 100)}%` : "2px" }}
            />
          ))}
        </div>
        <figcaption className="mt-2 flex justify-between font-mono text-[11px] text-scribe-3">
          <span>{days[0].id}</span>
          <span>{fmtInt(fortnightRuns)} {fortnightRuns === 1 ? "run" : "runs"} in 14 days</span>
          <span>today</span>
        </figcaption>
      </figure>

      {recent.length ? (
        <ol className="mt-5">
          <li className="label pb-1">Ran most recently</li>
          {recent.map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2 font-mono text-[12px]">
              <Link href={`/operator/${o.id}`} className="text-scribe hover:text-probe">{shortHash(o.id)}</Link>
              <span className="text-scribe-3">
                {fmtInt(o.runCount)} {o.runCount === 1 ? "run" : "runs"}
                {o.passkeyRunCount ? ` · ${fmtInt(o.passkeyRunCount)} by passkey` : ""}
                {" · "}{fmtMon(wei(o.paidTotal), 4)} {CURRENCY}
                {o.lastRunAt ? ` · ${ago(Number(o.lastRunAt))}` : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-3 font-mono text-[11px] text-scribe-3">
        Indexed to block {fmtInt(Number(stats.lastBlock))}, last event {ago(Number(stats.lastEventAt))}.
      </p>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className="tabular-nums text-scribe">{value}</span>
    </span>
  );
}
