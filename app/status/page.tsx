"use client";

import { useEffect, useState } from "react";
import { Notify } from "@/components/notify";
import { DimRule } from "@/components/primitives";
import { appChain, addressUrl, AXON_ADDRESS } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtInt } from "@/lib/format";
import { PULSE_KEY } from "@/components/pulse";

type Check = { ok: boolean; detail: string };
type Health = {
  ok: boolean;
  live?: boolean;
  checks: Record<string, Check>;
  /** Historical findings, reported beside the live checks but never the reason
   *  the endpoint returns a failing status. */
  audit?: Record<string, Check>;
};

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

  // Both groups are shown. Splitting them in the API so a historical finding
  // stops returning 503 would be worth nothing if the page then hid it.
  const entries = h ? [...Object.entries(h.checks), ...Object.entries(h.audit ?? {})] : [];
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

      <DimRule className="mt-10" note="Being told" />
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        No email, because there are no accounts here and nothing to send one to.
        Web push needs neither: your browser issues the subscription, the keys
        were generated for this deployment, and there is no third party in the
        path.
      </p>
      <div className="mt-5">
        <Notify />
      </div>

      <UsagePanel />
    </div>
  );
}

type Stats = {
  since: string; days: number;
  views: { path: string; n: number }[];
  viewsByDay: { day: string; n: number }[];
  runs: { total: number; operators: number; meanScore: number; byDay: { day: string; n: number }[] };
};

/**
 * What is used, in aggregate.
 *
 * The opt-out sits on the same page as the numbers rather than in a policy
 * nobody opens. Anyone reading the counts can see, in the same glance, exactly
 * what is counted and how to stop being part of it.
 */
function UsagePanel() {
  const [s, setS] = useState<Stats | null>(null);
  const [out, setOut] = useState(false);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS).catch(() => setS(null));
    const t = setTimeout(() => {
      try { setOut(localStorage.getItem(PULSE_KEY) === "1"); } catch { /* storage blocked */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    const next = !out;
    setOut(next);
    try {
      if (next) localStorage.setItem(PULSE_KEY, "1");
      else localStorage.removeItem(PULSE_KEY);
    } catch { /* storage blocked; nothing was being stored anyway */ }
  };

  const peak = s ? Math.max(1, ...s.viewsByDay.map((d) => d.n)) : 1;
  const totalViews = s ? s.views.reduce((n, v) => n + v.n, 0) : 0;

  return (
    <>
      <DimRule className="mt-10" note="Usage" />
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Counts, with no subject. A page open adds one to a row holding a path, a
        date and an integer &mdash; there is no cookie, no identifier, and no
        column the schema could put one in. Requests that signal Do Not Track or
        Global Privacy Control are not counted at all.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Page opens</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">{s ? fmtInt(totalViews) : "—"}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Runs paid</span>
          <span className="font-mono text-[15px] tabular-nums text-signal">{s ? fmtInt(s.runs.total) : "—"}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Operators</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe-2">{s ? fmtInt(s.runs.operators) : "—"}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Window</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe-2">{s ? `${s.days} days` : "—"}</span>
        </span>
      </div>

      {s && s.viewsByDay.length > 0 ? (
        <div className="mt-5 flex h-20 items-end gap-1" role="img"
             aria-label={`Page opens per day over ${s.days} days, peaking at ${peak}`}>
          {s.viewsByDay.map((d) => (
            <span key={d.day} title={`${d.day} — ${d.n}`}
                  className="flex-1 bg-rule-strong transition-[height]"
                  style={{ height: `${Math.max(3, (d.n / peak) * 100)}%` }} />
          ))}
        </div>
      ) : null}

      {s && s.views.length > 0 ? (
        <ul className="mt-5 flex flex-col">
          {s.views.slice(0, 8).map((v) => (
            <li key={v.path} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
              <span className="font-mono text-[13px] text-scribe-2">{v.path}</span>
              <span className="font-mono text-[13px] tabular-nums text-scribe-3">{fmtInt(v.n)}</span>
            </li>
          ))}
        </ul>
      ) : s ? (
        <p className="mt-5 font-mono text-[13px] text-scribe-3">
          Nothing counted yet in this window.
        </p>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-pressed={out}
        className={cn(
          "mt-5 border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
          out
            ? "border-rule-strong text-scribe"
            : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
        )}
      >
        {out ? "Not counting this browser" : "Stop counting this browser"}
      </button>
    </>
  );
}
