"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useMyRuns, useStats } from "@/lib/hooks";
import { Progression } from "@/components/progression";
import { RecordSync } from "@/components/record-sync";
import { Referral } from "@/components/referral";
import { progressionByTask, type ScoredRun } from "@/lib/progression";
import { TOLERANCE_MM } from "@/lib/score";
import { addressUrl, CURRENCY, txUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtMon, fmtScore } from "@/lib/format";
import { useTaskCatalogue } from "@/components/tasks-provider";

export default function PortfolioPage() {
  const s = useSession();
  const { data: runs, isLoading, isError, refetch } = useMyRuns();
  const { data: stats } = useStats();
  const { tasks } = useTaskCatalogue();

  const nameOf = (id: number) => tasks?.find((t) => t.id === id)?.name ?? `Task #${id}`;

  if (!s.connected) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-24">
        <h1 className="font-display text-4xl font-600 leading-none">Portfolio</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-scribe-2">
          Your portfolio is read straight off the chain: every run you have
          recorded, what it measured, and the transaction that paid it. Connect
          the wallet you run with to open it.
        </p>
        <Button variant="primary" className="mt-6" onClick={s.connect} disabled={s.connecting}>
          {s.connecting ? "Connecting…" : "Connect a wallet"}
        </Button>
      </div>
    );
  }

  const totalPaid = (runs ?? []).reduce((n, r) => n + r.paidMon, 0);
  const best = runs?.length ? Math.max(...runs.map((r) => r.score)) : 0;
  const scored: ScoredRun[] = (runs ?? []).map((r) => ({
    score: r.score, at: r.at, trajHash: r.trajHash, taskId: r.taskId,
  }));
  const mine = progressionByTask(scored);

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Portfolio</h1>
        <a
          href={s.address ? addressUrl(s.address) : "#"}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-scribe-3 hover:text-probe"
        >
          {s.address}
        </a>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-rule py-3">
        <Reading label="Balance" value={fmtMon(s.balance, 4)} unit={CURRENCY} tone="signal" />
        <Reading label="Earned on chain" value={fmtMon(stats?.earnedMon ?? totalPaid, 4)} unit={CURRENCY} tone="signal" />
        <Reading label="Accepted runs" value={String(stats?.runs ?? runs?.length ?? 0)} />
        <Reading label="Mean score" value={stats?.runs ? fmtScore(stats.meanScore) : "—"} />
        <Reading label="Best score" value={best ? fmtScore(best) : "—"} />
      </div>

      {s.address ? <RecordSync address={s.address} /> : null}

      {/* Deployed, funded and paying since the beginning, and reachable from
          nowhere: nobody could see whether they had been credited, and the
          newcomer who has to make the call had no way to make it. */}
      <Referral />

      {/* Whether running a task again helped. Read from the chain here rather
          than from the ledger, so the deltas are score only — the chain has
          never held a deviation, and inventing a millimetre to fill the
          sentence would be the wrong kind of complete. */}
      {mine.length ? (
        <>
          <DimRule className="mt-8" note="Run to run" />
          <Progression runs={scored} className="mt-4" />
        </>
      ) : null}

      <DimRule className="mt-8" note="Run history" />

      {isError ? (
        <div className="mt-6 border border-reject bg-reject-dim px-6 py-10 text-center">
          <p className="text-[15px] text-reject">Could not read your runs from the chain.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 border border-reject px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-reject transition-colors hover:bg-reject hover:text-ink-0"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <ul className="mt-4 flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-16" />)}
        </ul>
      ) : (runs?.length ?? 0) === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">No runs recorded on this address yet.</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-scribe-3">
            Every accepted run shows here with its measurement, its score, and the
            transaction that paid it.
          </p>
          <Link
            href="/hub"
            className="mt-5 inline-block border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
          >
            Find a task
          </Link>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col">
          {runs!.map((r) => {
            const inTol = Math.abs(0) <= TOLERANCE_MM;
            return (
              <li key={r.id} className="border-b border-rule py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-mono text-[12px] text-scribe-3">
                      run #{r.id} · task #{r.taskId} · {new Date(r.at).toLocaleString()}
                    </span>
                    <Link href={`/task/${r.taskId}`} className="text-[15px] text-scribe hover:text-signal">
                      {nameOf(r.taskId)}
                    </Link>
                    <Link
                      href={`/run/${r.trajHash}`}
                      className="font-mono text-[12px] text-scribe-3 hover:text-probe"
                    >
                      {r.cid} · verify this run →
                    </Link>
                  </div>
                  <div className="flex items-center gap-6">
                    <Reading label="Score" value={fmtScore(r.score)} tone={inTol ? undefined : "reject"} />
                    <Reading label="Paid" value={fmtMon(r.paidMon, 4)} tone="signal" />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Settlements address={s.address} />
    </div>
  );
}

type Settlement = {
  txHash: string; method: string; succeeded: boolean;
  at: number; blockNumber: number; gasUsed: number; feeAvax: number;
};

/**
 * The same address, read from Avalanche's own index rather than from us.
 *
 * Everything above arrives through this deployment: our RPC calls, our
 * database's transaction hashes. This asks Glacier instead, so it still answers
 * if our server is gone — and it shows the calls that reverted, which a ledger
 * of accepted runs by definition cannot.
 */
function Settlements({ address }: { address?: string | null }) {
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/glacier/${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { settlements: Settlement[] }) => { if (live) setRows(d.settlements); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [address]);

  if (failed) {
    return (
      <>
        <DimRule className="mt-10" note="On-chain activity" />
        <p className="mt-4 text-[14px] text-scribe-3">
          Avalanche&rsquo;s index would not answer just now. The run history above is
          read from the contract directly and is unaffected.
        </p>
      </>
    );
  }

  return (
    <>
      <DimRule className="mt-10" note="On-chain activity" />
      <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        Every call this address has made to the protocol, as Avalanche&rsquo;s own
        indexer recorded it &mdash; including the ones that reverted. This list does
        not pass through our database, so it still resolves if this deployment does not.
      </p>

      {rows && rows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
          <span className="flex items-baseline gap-2">
            <span className="label">Gas paid, all calls</span>
            <span className="font-mono text-[15px] tabular-nums text-scribe-2">
              {rows.reduce((n, r) => n + r.feeAvax, 0).toFixed(9)}
              <span className="ml-1 text-[12px] text-scribe-3">{CURRENCY}</span>
            </span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="label">Mean per call</span>
            <span className="font-mono text-[15px] tabular-nums text-scribe-3">
              {(rows.reduce((n, r) => n + r.feeAvax, 0) / rows.length).toFixed(9)}
            </span>
          </span>
          <span className="max-w-[46ch] text-[13px] leading-relaxed text-scribe-3">
            Fuji settles at 160 wei a gas unit, so recording a run costs about
            0.000000065 {CURRENCY} against the {CURRENCY} it pays. The cost of
            submitting is not what stands between an operator and their first run.
          </span>
        </div>
      ) : null}

      {rows === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-3">
          No calls to the protocol from this address yet.
        </p>
      ) : (
        <ol className="mt-3">
          {rows.map((r) => (
            <li
              key={r.txHash}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))]"
            >
              <span className="truncate font-mono text-[13px] text-scribe">{r.method}</span>
              <span className="hidden font-mono text-[12px] tabular-nums text-scribe-3 sm:block">
                {r.feeAvax.toFixed(9)}
              </span>
              <span
                className={cn(
                  "font-mono text-[12px] uppercase tracking-[0.12em]",
                  r.succeeded ? "text-scribe-3" : "text-reject",
                )}
              >
                {r.succeeded ? "ok" : "reverted"}
              </span>
              <a
                href={txUrl(r.txHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] text-scribe-3 hover:text-probe"
              >
                {r.txHash.slice(0, 10)}&hellip; &rarr;
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Reading({
  label, value, unit, tone,
}: { label: string; value: string; unit?: string; tone?: "signal" | "go" | "reject" }) {
  const tones = { signal: "text-signal", go: "text-go", reject: "text-reject" } as const;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[14px] tabular-nums", tone ? tones[tone] : "text-scribe")}>
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}
