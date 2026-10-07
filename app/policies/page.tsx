"use client";

import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { fmtDate, fmtInt, shortHash } from "@/lib/format";
import { addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";

/**
 * Policies, ranked by what this server measured them doing.
 *
 * The argument this project makes about trajectories is that a score you
 * report about your own work is worth nothing and a score recomputed from the
 * artefact is worth something. Models trained on those trajectories normally
 * get the opposite treatment: a paper reports its own numbers on its own
 * held-out set and nobody can check either.
 *
 * So the starts are fixed and published, the rollout runs on the server in the
 * station's own dynamics, and every entry here is a measurement rather than a
 * claim.
 */

type Entry = {
  weightsHash: string; label: string; submitter: string;
  starts: number; grasped: number; placed: number;
  medianFinalMm: number; createdAt: number;
};

type Board = {
  starts: [number, number][];
  architecture: { in: number; hidden: number; out: number };
  note: string;
  entries: Entry[];
};

export default function PoliciesPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/policy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Board) => { if (live) setBoard(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none">Policies</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        A corpus is only worth what can be trained on it, and a model&rsquo;s own
        report of how well it did is worth what any self-reported number is.
        Every entry here was rolled out by this server, on the same eight
        starts, in the station&rsquo;s own dynamics.
      </p>
      {/* Two different things share the word "policy" on this product: a model
          submitted to this market, and a policy minted on the contract. The
          second is a cap table, and a reader who does not know that will assume
          the protocol is selling trained models. */}
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        A policy <em>minted on the contract</em> is a different object: a cap
        table over the trajectories that would train a model, so a licence fee
        splits to everyone who recorded them. Minting one trains nothing.
      </p>

      {board ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-rule py-3">
          <span className="flex items-baseline gap-2">
            <span className="label">Starts</span>
            <span className="font-mono text-[15px] tabular-nums text-scribe">{board.starts.length}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="label">Architecture</span>
            <span className="font-mono text-[13px] text-scribe-2">
              {board.architecture.in} → {board.architecture.hidden} → {board.architecture.hidden} → {board.architecture.out}
            </span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="label">Entries</span>
            <span className="font-mono text-[15px] tabular-nums text-scribe">{fmtInt(board.entries.length)}</span>
          </span>
        </div>
      ) : null}

      <DimRule className="mt-6" note="Ranked by placements, then grasps, then how close the misses were" />

      {failed ? (
        <p className="mt-4 font-mono text-[13px] text-reject">The board could not be read.</p>
      ) : !board ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-10" />)}
        </ul>
      ) : board.entries.length === 0 ? (
        <p className="mt-4 max-w-[62ch] font-mono text-[13px] text-scribe-3">
          Nothing submitted yet.
        </p>
      ) : (
        <ol className="mt-2">
          {board.entries.map((e, i) => (
            <li key={e.weightsHash} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule py-3">
              <span className="w-[28px] shrink-0 font-mono text-[12px] tabular-nums text-scribe-3">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-[200px] flex-1 text-[14px] text-scribe">{e.label}</span>
              <span className="flex items-baseline gap-1.5 font-mono text-[13px] tabular-nums">
                <span className={cn(e.placed > 0 ? "text-go" : "text-scribe-3")}>{e.placed}</span>
                <span className="text-scribe-3">/{e.starts} placed</span>
              </span>
              <span className="flex items-baseline gap-1.5 font-mono text-[13px] tabular-nums">
                <span className="text-scribe-2">{e.grasped}</span>
                <span className="text-scribe-3">/{e.starts} grasped</span>
              </span>
              <span className="font-mono text-[13px] tabular-nums text-scribe-2">
                {e.medianFinalMm.toFixed(0)} <span className="text-[12px] text-scribe-3">mm median</span>
              </span>
              <span className="flex items-baseline gap-3 font-mono text-[12px] text-scribe-3">
                <a href={addressUrl(e.submitter)} target="_blank" rel="noreferrer" className="hover:text-probe">
                  {shortHash(e.submitter)}
                </a>
                <span title={e.weightsHash}>{shortHash(e.weightsHash)}</span>
                <span>{fmtDate(e.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <DimRule className="mt-10" note="Submitting one" />
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        POST to <code className="font-mono text-[13px] text-scribe-2">/api/policy</code> with a
        submitter address, a label, and the weights — <code className="font-mono text-[13px] text-scribe-2">mean</code>,{" "}
        <code className="font-mono text-[13px] text-scribe-2">std</code> and three weight
        matrices with their biases, in the architecture above. Nothing you send is
        executed: a policy is three thousand numbers and evaluating one is
        arithmetic, which is why this can be open. An entry is keyed by the hash
        of its weights, so the same model submitted twice is one entry.
      </p>
      {board?.note ? (
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">{board.note}</p>
      ) : null}
    </div>
  );
}
