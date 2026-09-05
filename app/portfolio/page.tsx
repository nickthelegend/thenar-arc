"use client";

import Link from "next/link";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useMyRuns, useStats, useTasks } from "@/lib/hooks";
import { TOLERANCE_MM } from "@/lib/score";
import { addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtMon, fmtScore } from "@/lib/format";

export default function PortfolioPage() {
  const s = useSession();
  const { data: runs, isLoading, isError, refetch } = useMyRuns();
  const { data: stats } = useStats();
  const { data: tasks } = useTasks();

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
        {!s.hasWallet ? (
          <p className="mt-3 text-[13px] text-scribe-3">
            No injected wallet detected. Install MetaMask or any EVM wallet first.
          </p>
        ) : null}
      </div>
    );
  }

  const totalPaid = (runs ?? []).reduce((n, r) => n + r.paidMon, 0);
  const best = runs?.length ? Math.max(...runs.map((r) => r.score)) : 0;

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
        <Reading label="Balance" value={fmtMon(s.balance, 4)} unit="MON" tone="signal" />
        <Reading label="Earned on chain" value={fmtMon(stats?.earnedMon ?? totalPaid, 4)} unit="MON" tone="signal" />
        <Reading label="Accepted runs" value={String(stats?.runs ?? runs?.length ?? 0)} />
        <Reading label="Mean score" value={stats?.runs ? fmtScore(stats.meanScore) : "—"} />
        <Reading label="Best score" value={best ? fmtScore(best) : "—"} />
      </div>

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
    </div>
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
