"use client";

import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { fmtInt, fmtScore, shortHash } from "@/lib/format";
import { addressUrl, txUrl } from "@/lib/chain";

type Run = {
  traj_hash: string; task_id: number; contributor: string; score: number;
  deviation_mm: number; duration_s: number; sample_count: number;
  created_at: number; tx_hash: string | null;
};
type Chain = { id: number; name: string; explorer: string; currency: string; runs: Run[] };
type Contract = { address: string; chainId: number; label: string; why: string; runs: Run[] };

export default function ArchivePage() {
  const [chains, setChains] = useState<Chain[] | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/archive")
      .then(async (r) => {
        const d: { chains?: Chain[]; contracts?: Contract[]; error?: string } = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? `the archive answered ${r.status}`);
        return d;
      })
      .then((d) => {
        if (!live) return;
        setChains(d.chains ?? []);
        setContracts(d.contracts ?? []);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setChains([]);
      });
    return () => { live = false; };
  }, []);

  const isLoading = chains === null;
  const list = chains ?? [];

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Archive</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        Runs this deployment no longer answers for: anything settled on an
        earlier chain, or against a contract the app has since replaced. They
        are kept out of the feed, the standings and the task pages because a
        payout is only verifiable against the deployment that made it, and the
        live contract has never heard of them.
      </p>

      <DimRule className="mt-6" />

      {isLoading ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : error ? (
        <p className="mt-6 text-[14px] text-reject">Could not read the archive: {error}</p>
      ) : list.length === 0 && contracts.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">Nothing archived.</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-scribe-3">
            Every stored run belongs to the chain this deployment currently settles on.
          </p>
        </div>
      ) : (
        list.map((c) => (
          <section key={c.id} className="mt-8">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
              <span className="flex items-baseline gap-2">
                <span className="label">Chain</span>
                <span className="font-mono text-[15px]">{c.name}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="label">Chain ID</span>
                <span className="font-mono text-[15px] tabular-nums text-scribe-2">{c.id}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="label">Runs</span>
                <span className="font-mono text-[15px] tabular-nums">{fmtInt(c.runs.length)}</span>
              </span>
            </div>

            <ol className="mt-2">
              {c.runs.map((r) => (
                <li
                  key={r.traj_hash}
                  /* Past tense, in the only way a list can be: dimmer than a
                     live feed, and lifting only on hover, so the archive is
                     legible without ever reading as current activity. */
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3.5 opacity-70 transition-opacity duration-300 hover:opacity-100 sm:grid-cols-[1fr_repeat(3,minmax(64px,auto))_auto]"
                >
                  {/* To the chain the run is actually on. Sending these to the
                      operator page would show the live chain's history for a run on an earlier one
                      and imply the two are the same ledger. */}
                  <a
                    href={`${c.explorer}/address/${r.contributor}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-[13px] text-scribe-2 hover:text-probe"
                  >
                    {shortHash(r.contributor)}
                  </a>
                  <span className="hidden font-mono text-[13px] tabular-nums text-scribe-3 sm:block">
                    task {r.task_id}
                  </span>
                  <span className="hidden font-mono text-[13px] tabular-nums text-scribe-2 sm:block">
                    {fmtScore(r.score)}
                  </span>
                  <span className="hidden font-mono text-[13px] tabular-nums text-scribe-3 sm:block">
                    {r.deviation_mm.toFixed(1)} mm
                  </span>
                  {r.tx_hash ? (
                    <a
                      href={`${c.explorer}/tx/${r.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[12px] text-scribe-3 hover:text-probe"
                    >
                      {shortHash(r.tx_hash)} &rarr;
                    </a>
                  ) : (
                    <span className="font-mono text-[12px] text-scribe-3">&mdash;</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      {contracts.map((c) => (
        <section key={c.address} className="mt-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
            <span className="flex items-baseline gap-2">
              <span className="label">Contract</span>
              <span className="font-mono text-[15px]">{c.label}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="label">Runs</span>
              <span className="font-mono text-[15px] tabular-nums">{fmtInt(c.runs.length)}</span>
            </span>
            <a
              href={addressUrl(c.address)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-scribe-3 hover:text-probe sm:ml-auto"
            >
              {shortHash(c.address)} &rarr;
            </a>
          </div>
          <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">{c.why}</p>

          <ol className="mt-2">
            {c.runs.map((r) => (
              <li
                key={r.traj_hash}
                className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-3.5 opacity-70 transition-opacity duration-300 hover:opacity-100 sm:grid-cols-[1fr_repeat(3,minmax(64px,auto))_auto]"
              >
                {/* Same chain as the live deployment, so the operator page is
                    the right destination — unlike the cross-chain rows above. */}
                <a href={`/operator/${r.contributor}`} className="truncate font-mono text-[13px] text-scribe-2 hover:text-probe">
                  {shortHash(r.contributor)}
                </a>
                <span className="hidden font-mono text-[13px] tabular-nums text-scribe-3 sm:block">task {r.task_id}</span>
                <span className="hidden font-mono text-[13px] tabular-nums text-scribe-2 sm:block">{fmtScore(r.score)}</span>
                <span className="hidden font-mono text-[13px] tabular-nums text-scribe-3 sm:block">
                  {r.deviation_mm.toFixed(1)} mm
                </span>
                {r.tx_hash ? (
                  <a href={txUrl(r.tx_hash)} target="_blank" rel="noreferrer"
                     className="font-mono text-[12px] text-scribe-3 hover:text-probe">
                    {shortHash(r.tx_hash)} &rarr;
                  </a>
                ) : (
                  <span className="font-mono text-[12px] text-scribe-3">&mdash;</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
