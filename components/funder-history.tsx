"use client";

import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { txUrlOn, appChain } from "@/lib/chain";
import { cn } from "@/lib/cn";

type Call = { txHash: string; method: string; succeeded: boolean; at: number; feeAvax: number };

/**
 * What this task's funder has actually done on the protocol.
 *
 * The contract says what a task is; it does not say what happened to it. Who
 * created it, whether it was topped up, whether a policy was minted — that is a
 * sequence of calls, and Avalanche's index already holds them, including the
 * ones that reverted.
 *
 * Framed as the funder's activity rather than the task's, because the indexer
 * works by address: claiming a per-task feed would be reading more into it than
 * is there.
 */
export function FunderHistory({ taskId, funder }: { taskId: number; funder: string }) {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/history?funder=${funder}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { history: Call[] }) => { if (live) setCalls(d.history); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [taskId, funder]);

  if (failed) {
    return (
      <>
        <DimRule className="mt-10" note="Funder activity" />
        <p className="mt-3 text-[14px] text-scribe-3">
          Avalanche&rsquo;s index would not answer just now. Everything above is read
          from the contract directly and is unaffected.
        </p>
      </>
    );
  }

  if (calls !== null && calls.length === 0) return null;

  return (
    <>
      <DimRule className="mt-10" note="Funder activity" />
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        Every lifecycle call this task&rsquo;s funder has made to the protocol, as
        Avalanche&rsquo;s own indexer recorded it &mdash; including any that reverted.
        Addresses, not tasks, are what the index is keyed by, so this is the
        funder&rsquo;s activity rather than only this task&rsquo;s.
      </p>

      {calls === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : (
        <ol className="mt-3">
          {calls.map((c) => (
            <li
              key={c.txHash}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))]"
            >
              <span className="truncate font-mono text-[13px] text-scribe">{c.method}</span>
              <span className="hidden font-mono text-[12px] tabular-nums text-scribe-3 sm:block">
                {new Date(c.at).toLocaleDateString()}
              </span>
              <span className={cn(
                "font-mono text-[12px] uppercase tracking-[0.12em]",
                c.succeeded ? "text-scribe-3" : "text-reject",
              )}>
                {c.succeeded ? "ok" : "reverted"}
              </span>
              <a
                href={txUrlOn(appChain.id, c.txHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] text-scribe-3 hover:text-probe"
              >
                {c.txHash.slice(0, 10)}&hellip; &rarr;
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
