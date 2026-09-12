"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatEther, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { DimRule } from "@/components/primitives";
import { addressUrl, txUrlOn, appChain, CURRENCY, AXON_ADDRESS } from "@/lib/chain";
import { fmtGasCost, fmtInt, fmtMon, fmtScore, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";
import { badgesFor, ACCEPTED_MEANS } from "@/lib/badges";
import { Progression } from "@/components/progression";
import { RecordSync } from "@/components/record-sync";
import { progressionByTask, type ScoredRun } from "@/lib/progression";

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

  /**
   * How many runs the contract paid this address for.
   *
   * The ledger below is the store of trajectories, and it is not the same
   * number. Three payouts on this contract have no stored trajectory — proofs
   * of the relayed submission path, signed straight to the contract without
   * going through the pipeline that keeps the samples — so an address whose
   * only paid run is one of those read "nothing recorded" here while the
   * leaderboard, which counts the chain, credited it with a run. Two surfaces,
   * one address, two different answers, and no way to tell which was lying.
   *
   * Both were right. What was missing was the subtraction, so it is done here.
   */
  /**
   * What the chain says this address earned, against what it paid to earn it.
   *
   * The page already read the gas from Avalanche's index and never put an
   * earnings figure beside it, which leaves the more interesting number
   * unstated: on this chain a submit costs about a two-millionth of what it
   * pays. That ratio is the argument for settling a sub-cent payout on chain
   * at all, and it was sitting in two figures nobody had subtracted.
   */
  const { data: chainStats } = useReadContract({
    address: AXON_ADDRESS,
    abi: [{
      type: "function", name: "stats",
      inputs: [{ name: "who", type: "address" }],
      outputs: [
        { name: "runs", type: "uint256" },
        { name: "earned", type: "uint256" },
        { name: "meanScore", type: "uint256" },
      ],
      stateMutability: "view",
    }],
    functionName: "stats",
    args: [address as `0x${string}`],
    query: { enabled: valid },
  });

  const { data: onChainIds } = useReadContract({
    address: AXON_ADDRESS,
    abi: [{
      type: "function", name: "trajectoriesOf",
      inputs: [{ name: "who", type: "address" }],
      outputs: [{ type: "uint256[]" }], stateMutability: "view",
    }],
    functionName: "trajectoriesOf",
    args: [address as `0x${string}`],
    query: { enabled: valid },
  });

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
  /** Paid on chain but with no artefact in the ledger. Never negative: more
   *  stored than the chain paid would be a different and much worse fault, and
   *  it is asserted against in the test suite rather than papered over here. */
  const paidOnChain = onChainIds?.length ?? null;
  const unretrievable =
    paidOnChain === null || runs === null ? 0 : Math.max(0, paidOnChain - accepted.length);
  const best = accepted.length ? Math.max(...accepted.map((r) => r.score)) : 0;
  const mean = accepted.length ? accepted.reduce((n, r) => n + r.score, 0) / accepted.length : 0;
  const gas = (calls ?? []).reduce((n, c) => n + c.feeAvax, 0);
  const earned = chainStats ? Number(formatEther((chainStats as readonly bigint[])[1])) : null;
  const badges = badgesFor(accepted);
  const scored: ScoredRun[] = accepted.map((r) => ({
    score: r.score,
    deviationMm: r.deviation_mm,
    durationS: r.duration_s,
    at: r.created_at,
    trajHash: r.traj_hash,
    taskId: r.task_id,
  }));
  // Whether there is a progression at all, rather than whether there are runs.
  // A section header over a component that renders nothing is a section that
  // says an operator repeated a task when they did not.
  const repeats = progressionByTask(scored);
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
        {unretrievable > 0 ? (
          <Reading label="Paid, not retrievable" value={fmtInt(unretrievable)} />
        ) : null}
        <Reading label="Best score" value={best ? fmtScore(best) : "—"} />
        <Reading label="Mean score" value={accepted.length ? fmtScore(Math.round(mean)) : "—"} />
        <Reading label="Protocol calls" value={calls === null ? "—" : fmtInt(calls.length)} />
        <Reading label="Reverted" value={calls === null ? "—" : fmtInt(reverted)} tone={reverted ? "reject" : undefined} />
        <Reading label="Earned on chain" value={earned === null ? "—" : fmtMon(earned, 6)} unit={CURRENCY} tone="signal" />
        <Reading label="Gas paid" value={calls === null ? "—" : gas.toFixed(9)} unit={CURRENCY} />
      </div>

      {/* The subtraction nobody had done. Stated as a ratio because the two
          figures are six orders of magnitude apart and sit side by side above,
          where the eye reads them as comparable. */}
      {earned !== null && earned > 0 && calls !== null && gas > 0 ? (
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-scribe-2">
          This address earned{" "}
          <span className="font-mono tabular-nums text-scribe">{fmtMon(earned, 6)} {CURRENCY}</span>{" "}
          and paid{" "}
          <span className="font-mono tabular-nums text-scribe">{fmtGasCost(gas, CURRENCY)}</span>{" "}
          in gas to do it &mdash; the work is worth{" "}
          <span className="font-mono tabular-nums text-signal">
            {Math.round(earned / gas).toLocaleString("en-GB")}×
          </span>{" "}
          what it cost to record. A payout this small only survives settlement
          on a chain where the settlement is a rounding error on it.
        </p>
      ) : null}

      {/* The token that counts this address's work, and how far behind it is.
          sync is callable by anyone for anyone by design, and was callable from
          nowhere. */}
      <RecordSync address={address as `0x${string}`} />

      <DimRule className="mt-8" note="What the record says" />
      <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
        Not awards, and not a score of their own. Each is a statement about the
        runs below it, recomputed from them on every load and carrying the
        reading it was derived from &mdash; so there is nothing here you cannot
        check against the ledger yourself. Accepted means {ACCEPTED_MEANS}.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
        {badges.map((b) => (
          <li
            key={b.id}
            className={cn(
              "relative flex flex-col gap-1 bg-ink-1 px-3 py-3",
              !b.earned && "opacity-55",
            )}
          >
            {/* The bar is the progress, drawn behind the text rather than as a
                second element, so an unearned badge reads as one thing. */}
            {b.progress !== undefined && !b.earned ? (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-ink-2"
                style={{ width: `${Math.round(b.progress * 100)}%` }}
              />
            ) : null}
            <span className="relative flex items-baseline justify-between gap-2">
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe">
                {b.label}
              </span>
              {b.earned ? (
                <span className="text-[13px] leading-none text-go" aria-label="held">&#10003;</span>
              ) : null}
            </span>
            <span className="relative font-mono text-[11px] leading-snug text-scribe-3">
              {b.evidence}
            </span>
          </li>
        ))}
      </ul>

      {/* Whether running it again helped.
          The contract caps a contributor at five runs on a task because
          repetition is the point, and every surface still showed those runs as
          a flat list — a best, a mean, and a row each. The one number a repeat
          operator wants, whether this one beat the last one, was left to be
          worked out by eye. */}
      {repeats.length ? (
        <>
          <DimRule className="mt-8" note="Run to run" />
          <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
            Only tasks driven more than once, oldest attempt first. The delta is
            against the run before it, not against the best &mdash; a decline is
            shown as plainly as a gain, because the operator it matters to is
            the one it is happening to.
          </p>
          <Progression runs={scored} className="mt-4" />
        </>
      ) : null}

      <DimRule className="mt-8" note="Accepted runs" />
      {runs === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : accepted.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-3">
          {unretrievable > 0 ? (
            <>
              The contract paid this address for {fmtInt(unretrievable)}{" "}
              {unretrievable === 1 ? "run" : "runs"}, and the trajectory behind{" "}
              {unretrievable === 1 ? "it" : "them"} was never stored — so the payout
              is real and the recording cannot be shown. The calls below are still
              on {appChain.name} and still checkable.
            </>
          ) : (
            <>Nothing recorded against this address on {appChain.name}.</>
          )}
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
  label: string; value: string; unit?: string; tone?: "reject" | "signal";
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn(
        "font-mono text-[15px] tabular-nums",
        tone === "reject" ? "text-reject" : tone === "signal" ? "text-signal" : "text-scribe",
      )}>
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}
