"use client";

import { useEffect, useState } from "react";
import type { Episode } from "@/components/episode-card";
import { fmtInt, fmtScore, shortHash } from "@/lib/format";
import { median } from "@/lib/monad-commit";
import { cn } from "@/lib/cn";

/**
 * What one task's corpus amounts to, for someone deciding whether to buy it.
 *
 * Three answers, each from where it lives:
 * - the episodes, under every outcome, from the corpus index;
 * - the Merkle root this server computes over the paid episodes, and the one
 *   the verifier committed on chain (CorpusManifest), with whether they agree,
 *   plus the Chainlink CRE audit's verdict when one has been written;
 * - how many times agents have bought this task's file, from the sales the
 *   ledger records against SalesLog.
 */

type Manifest = {
  episodes: number; computed: string | null; contract: string | null;
  committed: { root: string; episodes: number; at: number } | null;
  matches: boolean | null;
  audit: { verdict: string; observedAt: number } | null;
};

type State = { key: number; episodes: Episode[] | null; manifest: Manifest | null; sales: number | null; failed: boolean };

export function TaskCorpusSummary({ taskId }: { taskId: number }) {
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    let live = true;
    const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    Promise.allSettled([
      get(`/api/corpus?outcome=all&taskId=${taskId}`),
      get(`/api/task/${taskId}/manifest`),
      get(`/api/agent/sales`),
    ]).then(([c, m, a]) => {
      if (!live) return;
      setS({
        key: taskId,
        episodes: c.status === "fulfilled" ? (c.value.episodes as Episode[]) : null,
        manifest: m.status === "fulfilled" ? (m.value as Manifest) : null,
        sales: a.status === "fulfilled" ? (a.value.sales as { task_id: number }[]).filter((x) => x.task_id === taskId).length : null,
        failed: c.status === "rejected",
      });
    });
    return () => { live = false; };
  }, [taskId]);

  const ready = s?.key === taskId ? s : null;
  const eps = ready?.episodes ?? [];
  const paid = eps.filter((e) => e.outcome === "paid").length;
  const scored = eps.filter((e) => e.outcome !== "unsubmitted").length;
  const med = median(eps.map((e) => e.score));
  const m = ready?.manifest ?? null;

  // The same reading the Chainlink audit gives: a corpus that has only grown
  // since its last commitment is not one that disagrees with it.
  const root = !m ? "—"
    : !m.contract ? "no manifest contract here"
    : !m.committed ? "not committed yet"
    : m.matches ? "matches the chain"
    : m.committed.episodes < m.episodes ? "grown since the last commitment"
    : m.committed.episodes > m.episodes ? "short of the commitment"
    : "differs from the chain";
  const rootTone = m?.matches ? "text-go"
    : m?.committed && m.matches === false && m.committed.episodes >= m.episodes ? "text-reject"
    : "text-scribe-2";

  const cells: [string, React.ReactNode, string?][] = [
    ["Episodes", ready ? fmtInt(eps.length) : "…"],
    ["Paid", ready ? `${fmtInt(paid)}` : "…"],
    ["Pass rate", ready ? (scored ? `${Math.round((paid / scored) * 100)}%` : "—") : "…"],
    ["Median score", ready ? (med === null ? "—" : fmtScore(med)) : "…"],
    ["Agent sales", ready ? (ready.sales === null ? "—" : fmtInt(ready.sales)) : "…"],
  ];

  return (
    <section className="mt-6 border border-rule bg-ink-1 p-4" data-testid="task-corpus-summary" aria-label={`Task ${taskId}'s corpus`}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {cells.map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd className="font-mono text-base tabular-nums text-scribe">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-1 border-t border-rule pt-3 font-mono text-xs text-scribe-3">
        <span className="[overflow-wrap:anywhere]">
          Merkle root over the paid episodes:{" "}
          <span className="text-scribe-2" title={m?.computed ?? undefined}>{m?.computed ? shortHash(m.computed) : "—"}</span>{" "}
          · <span className={cn(rootTone)} data-testid="corpus-root-status">{root}</span>
          {m?.committed ? <> ({fmtInt(m.committed.episodes)} of {fmtInt(m.episodes)} episode{m.episodes === 1 ? "" : "s"} committed)</> : null}
        </span>
        {m?.audit ? (
          <span>Chainlink CRE audit: <span className={m.audit.verdict === "matches" ? "text-go" : "text-scribe-2"}>{m.audit.verdict}</span></span>
        ) : null}
        {ready?.failed ? <span className="text-reject">The corpus index could not be read for this task.</span> : null}
      </div>
    </section>
  );
}
