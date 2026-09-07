"use client";

import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { appChain, addressUrl, AXON_ADDRESS } from "@/lib/chain";
import { cn } from "@/lib/cn";

type Health = { ok: boolean; checks: Record<string, { ok: boolean; detail: string }> };

/**
 * The health endpoint, readable by a person.
 *
 * `/api/health` already checks the things that have to be true for a run to be
 * recordable — the signing key, the contract, the database, the RPC, and
 * whether the stored ledger still agrees with the contract's own count. It
 * returned JSON to whoever thought to curl it. This is the same seven checks,
 * refreshed, with what each one means when it fails.
 */
const MEANS: Record<string, string> = {
  verifierKey: "Without it the server cannot sign a score, and the contract will not pay an unsigned one.",
  contract: "The address every read and write goes to.",
  database: "Where the trajectories themselves live. The chain holds their hashes, not their samples.",
  rpc: "The endpoint used to read chain state and broadcast a submission.",
  verifierMatches: "The key the server signs with has to be the one the contract expects.",
  signingDomain: "The EIP-712 domain the server signs under has to match the contract's, or every submission reverts.",
  ledgerMatchesChain: "The number of runs shown has to equal the number the contract has recorded.",
};

export default function StatusPage() {
  const [h, setH] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      fetch("/api/health")
        .then((r) => r.json())
        .then((j: Health) => { if (live) { setH(j); setAt(Date.now()); setFailed(false); } })
        .catch(() => { if (live) setFailed(true); });
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const entries = h ? Object.entries(h.checks) : [];
  const passing = entries.filter(([, v]) => v.ok).length;

  return (
    <div className="mx-auto max-w-[820px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Status</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Everything that has to be true for a run to be recorded and paid, checked
        against the live system rather than reported from a config file. Refreshed
        every fifteen seconds.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Overall</span>
          <span className={cn("font-mono text-[15px]", h?.ok ? "text-go" : failed || h ? "text-reject" : "text-scribe-3")}>
            {failed ? "unreachable" : h ? (h.ok ? "operational" : "degraded") : "checking…"}
          </span>
        </span>
        {h ? (
          <span className="flex items-baseline gap-2">
            <span className="label">Checks</span>
            <span className="font-mono text-[15px] tabular-nums text-scribe-2">{passing} / {entries.length}</span>
          </span>
        ) : null}
        <span className="flex items-baseline gap-2">
          <span className="label">Chain</span>
          <span className="font-mono text-[15px] text-scribe-2">{appChain.name}</span>
        </span>
        <a href={addressUrl(AXON_ADDRESS)} target="_blank" rel="noreferrer"
           className="font-mono text-[12px] text-scribe-3 hover:text-probe sm:ml-auto">
          contract &rarr;
        </a>
      </div>

      <DimRule className="mt-6" note={at ? `last checked ${new Date(at).toLocaleTimeString()}` : "checking"} />

      {failed ? (
        <p className="mt-6 border border-reject bg-reject-dim px-4 py-3 font-mono text-[13px] text-reject">
          The health endpoint itself did not answer. That is its own answer.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {entries.map(([k, v]) => (
            <li key={k} className="flex flex-col gap-1 border-b border-rule py-3.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono text-[13px] text-scribe">{k}</span>
                <span className={cn("font-mono text-[12px] uppercase tracking-[0.12em]", v.ok ? "text-go" : "text-reject")}>
                  {v.ok ? "pass" : "fail"}
                </span>
              </span>
              <span className="font-mono text-[12px] text-scribe-2">{v.detail}</span>
              {MEANS[k] ? <span className="text-[13px] leading-relaxed text-scribe-3">{MEANS[k]}</span> : null}
            </li>
          ))}
          {entries.length === 0 && !failed ? (
            <li className="hatch h-8" aria-busy="true" />
          ) : null}
        </ul>
      )}
    </div>
  );
}
