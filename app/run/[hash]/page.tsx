"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DimRule, ToleranceBand } from "@/components/primitives";
import { TOLERANCE_MM } from "@/lib/score";
import { txUrl, addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtScore, fmtSeconds, shortHash } from "@/lib/format";

type RunDoc = {
  trajHash: string; taskId: number; contributor: string; score: number;
  deviationMm: number; durationSeconds: number;
  parts: { placement: number; efficiency: number; smoothness: number };
  sampleCount: number; createdAt: number; txHash: string | null;
  integrity: { recomputedHash: string; matches: boolean };
  samples: { t: number; grip: number; object: [number, number, number] }[];
};

/** Anyone can open this and check what a payout was actually for. */
export default function RunPage() {
  const { hash } = useParams<{ hash: string }>();
  const [cursor, setCursor] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["run", hash],
    queryFn: async (): Promise<RunDoc> => {
      const r = await fetch(`/api/trajectory/${hash}`);
      if (!r.ok) throw new Error((await r.json()).error ?? "not found");
      return r.json();
    },
  });

  const path = useMemo(() => {
    if (!data?.samples?.length) return null;
    const pts = data.samples.map((s) => s.object);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 0.04;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const to = (p: number[]) => [
      ((p[0] - minX) / span) * 300,
      300 - ((p[1] - minY) / span) * 300,
    ];
    const shown = Math.max(2, Math.round(pts.length * cursor));
    return {
      full: pts.map(to).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      trace: pts.slice(0, shown).map(to).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      head: to(pts[shown - 1]),
      grip: data.samples[shown - 1]?.grip ?? 0,
      t: data.samples[shown - 1]?.t ?? 0,
    };
  }, [data, cursor]);

  if (isLoading) {
    return <div className="mx-auto max-w-[900px] px-5 py-16"><span className="label">Resolving {shortHash(hash)}…</span></div>;
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">No trajectory with that hash</h1>
        <p className="mt-2 text-scribe-2">
          Nothing on file for {shortHash(hash)}. A run is stored when the verifier
          scores it, before it goes on chain.
        </p>
        <Link href="/hub" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the hub
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-[clamp(2.2rem,5vw,3.2rem)] font-700 leading-[0.96] tracking-[-0.02em]">
        Run {fmtScore(data.score)}
      </h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        One recorded trajectory, its measurement, and the transaction that paid
        for it. Anyone can open this and check what a payout was actually for.
      </p>
      <p className="mt-4 break-all font-mono text-[13px] text-scribe-3">{data.trajHash}</p>

      <div
        className={cn(
          "mt-5 flex flex-wrap items-center gap-3 border px-4 py-3 text-[13px]",
          data.integrity.matches ? "border-go bg-go-dim text-go" : "border-reject bg-reject-dim text-reject",
        )}
      >
        <span className="font-display text-[15px] tracking-[0.04em]">
          {data.integrity.matches ? "INTEGRITY VERIFIED" : "INTEGRITY FAILED"}
        </span>
        <span className="text-scribe-2">
          {data.integrity.matches
            ? "The stored samples re-hash to the value recorded on chain."
            : "The stored samples do not match the recorded hash."}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Score" value={fmtScore(data.score)} />
        <Cell label="Deviation" value={`${data.deviationMm.toFixed(1)} mm`} />
        <Cell label="Duration" value={fmtSeconds(data.durationSeconds)} />
        <Cell label="Samples" value={String(data.sampleCount)} />
      </div>

      <div className="mt-6 max-w-[440px]">
        <ToleranceBand deviationMm={data.deviationMm} toleranceMm={TOLERANCE_MM} label="Placement" />
      </div>

      <DimRule className="mt-10" note="Recorded tool path" />

      {path ? (
        <div className="mt-5 flex flex-col gap-3">
          <svg viewBox="0 0 300 300" className="w-full max-w-[420px] border border-rule bg-ink-0" role="img" aria-label="Path the payload travelled">
            <polyline points={path.full} fill="none" stroke="#24374C" strokeWidth="1.5" />
            <polyline points={path.trace} fill="none" stroke="#CB9A4E" strokeWidth="2" />
            <circle cx={path.head[0]} cy={path.head[1]} r="4" fill={path.grip < 14 ? "#CB9A4E" : "#5A8FCC"} />
          </svg>
          <label className="flex max-w-[420px] items-center gap-3">
            <span className="label shrink-0">Scrub</span>
            <input
              type="range" min={0.02} max={1} step={0.005} value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              className="flex-1 accent-brass"
              aria-label="Scrub through the recorded run"
            />
            <span className="w-[64px] shrink-0 text-right font-mono text-[12px] tabular-nums text-scribe-2">
              {path.t.toFixed(1)}s
            </span>
          </label>
        </div>
      ) : null}

      <DimRule className="mt-10" note="Provenance" />
      <dl className="mt-4 flex flex-col gap-2 font-mono text-[12px]">
        <Field label="Task">
          <Link href={`/task/${data.taskId}`} className="text-datum hover:underline">#{data.taskId}</Link>
        </Field>
        <Field label="Contributor">
          <a href={addressUrl(data.contributor)} target="_blank" rel="noreferrer" className="text-datum hover:underline">
            {data.contributor}
          </a>
        </Field>
        <Field label="Recorded">{new Date(data.createdAt).toLocaleString()}</Field>
        <Field label="Transaction">
          {data.txHash ? (
            <a href={txUrl(data.txHash)} target="_blank" rel="noreferrer" className="text-datum hover:underline">{data.txHash}</a>
          ) : (
            <span className="text-scribe-3">not submitted on chain</span>
          )}
        </Field>
      </dl>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-4 py-3">
      <span className="label">{label}</span>
      <span className="font-mono text-[15px] tabular-nums text-scribe">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 border-b border-rule py-1.5">
      <dt className="label w-[104px] shrink-0">{label}</dt>
      <dd className="min-w-0 break-all text-scribe-2">{children}</dd>
    </div>
  );
}
