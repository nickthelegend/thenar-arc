"use client";

import { useQuery } from "@tanstack/react-query";

import { DimRule } from "@/components/primitives";
import { addressUrl, VERDICTS_ADDRESS } from "@/lib/chain";

type Summary = { count: number; average: number | null };
type ArcInfo = {
  verifier: {
    address: string | null; agentId: string | null; bound: boolean; verdicts: number; written: number; meanScore: number;
    reputation: { runVerdict: Summary; corpusQuality: Summary };
  };
  external: { identityRegistry: string; reputationRegistry: string };
};

const avg = (s: Summary) => (s.average === null ? "—" : s.average.toFixed(2));

/**
 * Thenar's verifier as an ERC-8004 agent on Arc: its identity, every paid
 * verdict ThenarVerdicts wrote to the Reputation Registry, and what paying
 * buyer agents rated the corpus it certified. All read live through /api/arc.
 */
export function VerifierAgent() {
  const { data, isError } = useQuery({
    queryKey: ["arc-info"],
    queryFn: async () => {
      const r = await fetch("/api/arc");
      if (!r.ok) throw new Error(`/api/arc answered ${r.status}`);
      return (await r.json()) as ArcInfo;
    },
    refetchInterval: 15_000,
  });
  const v = data?.verifier;

  return (
    <>
      <DimRule className="mt-10" note="The verifier, as an ERC-8004 agent" />
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        Thenar&rsquo;s verifier scores every recording and signs the score the escrow pays against. It is registered
        in Arc&rsquo;s ERC-8004 Identity Registry, and every verdict that moved money is written to the Reputation
        Registry by <span className="font-mono text-[13px]">ThenarVerdicts</span> (tag{" "}
        <span className="font-mono text-[13px]">runVerdict</span>, the run id as feedbackHash), which only the escrow
        can drive. Buying agents rate the same agent from their own addresses after a purchase (tag{" "}
        <span className="font-mono text-[13px]">corpusQuality</span>, the sha256 of the bytes they were served), so
        the verifier&rsquo;s verdicts stand next to what paying buyers found.
      </p>
      {isError ? (
        <p className="mt-3 text-[14px] text-reject">The verifier&rsquo;s record could not be read just now.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-px bg-rule font-mono text-[12px] sm:grid-cols-4">
          <div className="bg-ink px-3 py-2">
            <dt className="label">Agent</dt>
            <dd className="text-scribe">
              {v?.agentId ? (
                <a href="/api/agents/verifier.json" className="text-signal hover:text-signal-hi">#{v.agentId}{v.bound ? "" : " (not bound)"}</a>
              ) : data ? "not registered" : "…"}
            </dd>
          </div>
          <div className="bg-ink px-3 py-2">
            <dt className="label">Paid verdicts</dt>
            <dd className="text-scribe">{v ? `${v.written} written / ${v.verdicts}` : "…"}</dd>
          </div>
          <div className="bg-ink px-3 py-2">
            <dt className="label">Mean verdict</dt>
            <dd className="text-scribe">{v ? `${avg(v.reputation.runVerdict)} (${v.reputation.runVerdict.count})` : "…"}</dd>
          </div>
          <div className="bg-ink px-3 py-2">
            <dt className="label">Buyers&rsquo; rating</dt>
            <dd className="text-scribe">{v ? `${avg(v.reputation.corpusQuality)} (${v.reputation.corpusQuality.count})` : "…"}</dd>
          </div>
        </dl>
      )}
      <p className="mt-2 font-mono text-[12px] text-scribe-3">
        {VERDICTS_ADDRESS ? (
          <a href={addressUrl(VERDICTS_ADDRESS)} target="_blank" rel="noreferrer" className="hover:text-probe">ThenarVerdicts &rarr;</a>
        ) : "ThenarVerdicts is not deployed on this network yet."}
        {data ? (
          <>
            {" · "}
            <a href={addressUrl(data.external.reputationRegistry)} target="_blank" rel="noreferrer" className="hover:text-probe">Reputation Registry &rarr;</a>
          </>
        ) : null}
      </p>
    </>
  );
}
