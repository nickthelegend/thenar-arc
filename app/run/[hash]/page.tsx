"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Copyable, DimRule, ToleranceBand } from "@/components/primitives";
import { TOLERANCE_MM } from "@/lib/score";
import { txUrlOn, addressUrl, appChain, chainMeta } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import { keccak256, toHex } from "viem";
import { canonicalise } from "@/lib/canonical";
import { useTaskCatalogue } from "@/components/tasks-provider";
import type { ReplaySample } from "@/components/station/replay";

/** WebGL has no business in the server render. */
const ReplayViewport = dynamic(
  () => import("@/components/station/replay").then((m) => m.ReplayViewport),
  { ssr: false },
);

type RunDoc = {
  trajHash: string; taskId: number; contributor: string; score: number;
  deviationMm: number; durationSeconds: number;
  parts: { placement: number; efficiency: number; smoothness: number };
  sampleCount: number; createdAt: number; txHash: string | null; chainId: number | null;
  integrity: { recomputedHash: string; matches: boolean };
  // q is the six joint angles the recorder stored, which is what makes a replay
  // a replay rather than a re-simulation.
  samples: ReplaySample[];
};

/** The datum every run on every task is measured against. Kept beside the
 *  station's own constant rather than imported, so a replay cannot silently
 *  drift from where the run was actually scored. */
const GOAL: [number, number] = [0.16, -0.18];

/** Anyone can open this and check what a payout was actually for. */
export default function RunPage() {
  const { hash } = useParams<{ hash: string }>();
  const [cursor, setCursor] = useState(1);
  const { byId } = useTaskCatalogue();
  const frame = useRef<ReplaySample | null>(null);

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

  // The scene the run was recorded in, from the same catalogue every other
  // surface reads, so a replay cannot show a different object from the station.
  const task = data ? byId(data.taskId) : undefined;

  const shownIndex = data?.samples?.length
    ? Math.max(1, Math.round(data.samples.length * cursor)) - 1
    : 0;

  // Keeping the frame in a ref means dragging the scrubber re-poses the arm
  // without re-rendering the page around it.
  useEffect(() => {
    frame.current = data?.samples?.[shownIndex] ?? null;
  }, [data, shownIndex]);

  /**
   * The hash, re-derived here rather than taken from us.
   *
   * The API already reports whether the stored samples re-hash to the recorded
   * value, but that is our server marking its own homework. This runs the same
   * canonicalisation and keccak in the browser, over the samples it was handed,
   * so the check does not depend on trusting the thing being checked.
   */
  const selfChecked = useMemo(() => {
    if (!data?.samples?.length) return null;
    try {
      const local = keccak256(toHex(canonicalise(data.taskId, data.contributor, data.samples as never)));
      return { local, matches: local.toLowerCase() === data.trajHash.toLowerCase() };
    } catch {
      return null;
    }
  }, [data]);

  const trail = useMemo(() => {
    const pts = data?.samples ?? [];
    const n = Math.max(2, shownIndex + 1);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const o = pts[i]?.object;
      if (!o) break;
      a[i * 3] = o[0];
      a[i * 3 + 1] = o[2] + 0.002;
      a[i * 3 + 2] = -o[1];
    }
    return a;
  }, [data, shownIndex]);

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
      <div className="mt-4">
        <Copyable value={data.trajHash} className="break-all text-[13px]" />
      </div>

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
        {selfChecked ? (
          <span className="mt-2 block font-mono text-[12px] leading-relaxed">
            <span className={selfChecked.matches ? "text-go" : "text-reject"}>
              {selfChecked.matches
                ? "Re-derived in this browser and it matches."
                : "Re-derived in this browser and it does NOT match."}
            </span>{" "}
            <span className="text-scribe-3">
              Computed here from the samples above, not taken from the server &mdash;
              so the check does not depend on trusting it.
            </span>
          </span>
        ) : null}
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

      {task && data.samples?.[0]?.q ? (
        <>
          <DimRule className="mt-10" note="The run itself" />
          <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
            Posed from the joint angles the recorder stored, in the room the task
            names. This is the trajectory the contract paid for, not a
            reconstruction of it &mdash; the samples driving the arm are the same
            ones the hash above is derived from.
          </p>
          <div className="mt-4 h-[340px] w-full border border-rule sm:h-[420px]">
            <ReplayViewport
              frame={frame}
              trail={trail}
              payloadUrl={task.scene.payload.url}
              payloadWidthMm={task.scene.payload.widthMm}
              targetUrl={task.scene.target.url}
              targetWidthMm={task.scene.target.widthMm}
              environmentUrl={task.scene.room.url}
              goal={GOAL}
            />
          </div>
        </>
      ) : null}


      <DimRule className="mt-10" note="Recorded tool path" />

      {path ? (
        <div className="mt-5 flex flex-col gap-3">
          <svg viewBox="0 0 300 300" className="w-full max-w-[420px] border border-rule bg-ink-0" role="img" aria-label="Path the payload travelled">
            <polyline points={path.full} fill="none" stroke="#3D3D3D" strokeWidth="1.5" />
            <polyline points={path.trace} fill="none" stroke="#FF6A00" strokeWidth="2" />
            <circle cx={path.head[0]} cy={path.head[1]} r="4" fill={path.grip < 14 ? "#FF6A00" : "#6E86A6"} />
          </svg>
          <label className="flex max-w-[420px] items-center gap-3">
            <span className="label shrink-0">Scrub</span>
            <input
              type="range" min={0.02} max={1} step={0.005} value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              className="flex-1 accent-signal"
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
          <Link href={`/task/${data.taskId}`} className="text-probe hover:underline">#{data.taskId}</Link>
        </Field>
        <Field label="Contributor">
          <a href={addressUrl(data.contributor)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
            {data.contributor}
          </a>
        </Field>
        <Field label="Recorded">{new Date(data.createdAt).toLocaleString()}</Field>
        <Field label="Transaction">
          {data.txHash ? (
            <a href={txUrlOn(data.chainId ?? appChain.id, data.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">{data.txHash}</a>
          ) : (
            <span className="text-scribe-3">not submitted on chain</span>
          )}
        </Field>
        {data.chainId && data.chainId !== appChain.id ? (
          // Runs from before the move. Saying so is the difference between an
          // archived payout and one the current chain cannot account for.
          <Field label="Settled on">
            <span className="text-scribe-2">
              {chainMeta(data.chainId)?.name ?? `chain ${data.chainId}`}
            </span>
            <span className="ml-2 text-scribe-3">
              &mdash; a previous deployment, kept in the{" "}
              <a href="/archive" className="text-probe hover:underline">archive</a>
            </span>
          </Field>
        ) : null}
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
