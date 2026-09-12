"use client";

import Link from "next/link";
import { PhysicsCheck } from "@/components/physics-check";
import { RunCertificate } from "@/components/run-certificate";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { propById, type Prop } from "@/lib/props";
import dynamic from "next/dynamic";
import { Copyable, DimRule, ToleranceBand } from "@/components/primitives";
import { PhaseTimeline } from "@/components/phase-timeline";
import { InCorpus } from "@/components/in-corpus";
import { TOLERANCE_MM } from "@/lib/score";
import { classifyFailure } from "@/lib/failure";
import { wouldHavePaid, wouldHavePaidSentence } from "@/lib/shortfall";
import { classifyRead } from "@/lib/store-failure";
import { ACCEPT_FLOOR } from "@/lib/score";
import { deviationFromSamples } from "@/lib/score";
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
  /** The props the run was driven against, when its instruction left the scene
   *  open. Null on every run whose instruction named its objects. */
  payloadIds: string[] | null;
  // q is the six joint angles the recorder stored, which is what makes a replay
  // a replay rather than a re-simulation.
  samples: ReplaySample[];
};

/** The datum every run on every task is measured against. Kept beside the
 *  station's own constant rather than imported, so a replay cannot silently
 *  drift from where the run was actually scored. */
const GOAL: [number, number] = [0.16, -0.18];

/** Anyone can open this and check what a payout was actually for. */
export default function RunView() {
  const { hash } = useParams<{ hash: string }>();
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  /** Playback rate. A run is a minute or two of twenty-hertz frames, so real
   *  time is often the wrong speed to look at it in — a placement is decided
   *  in about four frames, and the approach to it is a long slow arc. */
  const [rate, setRate] = useState(1);
  const { byId } = useTaskCatalogue();
  const frame = useRef<ReplaySample | null>(null);

  /**
   * Two failures that are not the same failure. See lib/store-failure.ts for
   * why the status alone cannot tell them apart.
   */
  const { data, isLoading, error } = useQuery({
    queryKey: ["run", hash],
    retry: false,
    queryFn: async (): Promise<RunDoc> => {
      let r: Response;
      try {
        r = await fetch(`/api/trajectory/${hash}`);
      } catch {
        throw new Error("unreachable");
      }
      if (!r.ok) throw new Error(classifyRead(r.status, await r.json().catch(() => null)));
      return r.json();
    },
  });
  const unreachable = error instanceof Error && error.message === "unreachable";

  /**
   * The other runs on this task, faintly, behind this one.
   *
   * A single path says what this operator did. It does not say whether that
   * was the usual route or an unusual one, and that is the question a reader
   * comparing runs actually has. Drawn in the same projection as the trace
   * above it, so "further left" means the same thing in both.
   *
   * Fetched separately and allowed to fail: the run page is about this run,
   * and a missing overlay should cost nothing.
   */
  const [siblings, setSiblings] = useState<[number, number][][]>([]);
  useEffect(() => {
    if (!data) return;
    let live = true;
    fetch(`/api/task/${data.taskId}/paths`)
      .then((r) => r.json())
      .then((d: { paths?: { trajHash: string; points: [number, number][] }[] }) => {
        if (!live) return;
        setSiblings(
          (d.paths ?? [])
            .filter((p) => p.trajHash.toLowerCase() !== data.trajHash.toLowerCase())
            .map((p) => p.points),
        );
      })
      .catch(() => { if (live) setSiblings([]); });
    return () => { live = false; };
  }, [data]);

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
    const project = (p: [number, number][]) =>
      p.map(([x, y]) => to([x, y])).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return {
      others: siblings.map(project),
      full: pts.map(to).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      trace: pts.slice(0, shown).map(to).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      head: to(pts[shown - 1]),
      grip: data.samples[shown - 1]?.grip ?? 0,
      t: data.samples[shown - 1]?.t ?? 0,
    };
  }, [data, cursor, siblings]);

  // The scene the run was recorded in, from the same catalogue every other
  // surface reads, so a replay cannot show a different object from the station.
  const task = data ? byId(data.taskId) : undefined;

  /**
   * The objects this run held, not the objects its task is about.
   *
   * On a task whose instruction names its props these are the same thing. On
   * one that left the scene open they are not, and reading the catalogue would
   * replay a run holding an object it never held. The recording says which,
   * and the recording is what the payout was derived from.
   */
  const replayProps = useMemo(() => {
    const stored = (data?.payloadIds as string[] | null | undefined) ?? null;
    const fromRun = stored?.map((id) => propById(id)).filter((p): p is Prop => Boolean(p));
    const resolved = fromRun?.length ? fromRun : task?.scene.payloads;
    return (resolved ?? []).map((p) => ({ url: p.url, widthMm: p.widthMm }));
  }, [data, task]);

  const shownIndex = data?.samples?.length
    ? Math.max(1, Math.round(data.samples.length * cursor)) - 1
    : 0;

  /**
   * Move the cursor by whole frames.
   *
   * The scrubber's own arrow keys move by its `step`, which is a fraction of
   * the run and lands between samples. The moments worth stopping on are one
   * frame wide — the frame the jaws close, the frame the payload is let go —
   * so stepping is done in the recording's units rather than the widget's.
   */
  const step = useCallback((by: number) => {
    const total = data?.samples?.length ?? 0;
    if (total < 2) return;
    const at = Math.max(0, Math.min(total - 1, shownIndex + by));
    setCursor(Math.max(0.02, (at + 1) / total));
  }, [data, shownIndex]);

  /**
   * Playback.
   *
   * Driven by the wall clock rather than by a frame counter, so a browser that
   * drops frames plays the run at the right speed with gaps instead of playing
   * it slowly. Stops at the end rather than looping: the last frame is the
   * placement, and a loop would carry the reader past the thing they came for.
   */
  useEffect(() => {
    if (!playing) return;
    const total = data?.samples?.length ?? 0;
    if (total < 2) return;
    const hz = 20;
    let raf = 0;
    let last = performance.now();
    let at = shownIndex;
    const tick = (now: number) => {
      const advanced = ((now - last) / 1000) * hz * rate;
      if (advanced >= 1) {
        at = Math.min(total - 1, at + Math.floor(advanced));
        last = now;
        setCursor(Math.max(0.02, (at + 1) / total));
        if (at >= total - 1) { setPlaying(false); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // shownIndex is deliberately not a dependency: it changes every frame this
    // effect sets, and depending on it would restart playback on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, data]);

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
      const local = keccak256(
        toHex(
          canonicalise(
            data.taskId,
            data.contributor,
            data.samples as never,
            (data.payloadIds as string[] | null) ?? undefined,
          ),
        ),
      );
      return { local, matches: local.toLowerCase() === data.trajHash.toLowerCase() };
    } catch {
      return null;
    }
  }, [data]);

  /**
   * The moments worth jumping to.
   *
   * Scrubbing a two-minute run to find the instant the payload was picked up or
   * let go is the kind of work a page should do for you. Both are already in the
   * recording: the jaw opening crosses the grasp threshold and stays there.
   * Release is the one that matters — it is where the placement is decided, and
   * therefore where 55% of the score was won or lost.
   */
  const moments = useMemo(() => {
    const s2 = data?.samples ?? [];
    if (s2.length < 2) return null;
    const CLOSED = 14; // mm, matching the station's grasp threshold
    let grasp: number | null = null;
    let release: number | null = null;
    for (let i = 1; i < s2.length; i += 1) {
      const was = s2[i - 1].grip, now = s2[i].grip;
      if (grasp === null && was > CLOSED && now <= CLOSED) grasp = i;
      if (grasp !== null && was <= CLOSED && now > CLOSED) release = i;
    }
    return { grasp, release, total: s2.length };
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

  if (unreachable) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="font-display text-3xl">The recording store did not answer</h1>
        <p className="mt-2 max-w-[52ch] text-scribe-2">
          We cannot say whether {shortHash(hash)} is on file, because the store
          that holds the samples is unreachable. This is a statement about us,
          not about the run.
        </p>
        <p className="mt-3 max-w-[52ch] font-mono text-[13px] leading-relaxed text-scribe-3">
          Everything settled on chain is unaffected and still readable:{" "}
          <Link href="/contracts" className="text-signal hover:text-signal-hi">/contracts</Link>{" "}
          reads the protocol directly, and{" "}
          <Link href="/leaderboard" className="text-signal hover:text-signal-hi">/leaderboard</Link>{" "}
          is built from the ledger&rsquo;s own events.
        </p>
        <Link href="/hub" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the hub
        </Link>
      </div>
    );
  }

  if (!data) {
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

      <PhaseTimeline
        samples={data.samples ?? []}
        cursor={cursor}
        onSeek={setCursor}
      />

      {/* Which of the failure modes this run hit.
          The taxonomy has existed since the corpus started keeping failures —
          a negative example is only worth training on if you know what it is an
          example of — and it shipped in the dataset export and nowhere a person
          could see it. Its own header says the reason shown on the run page is
          the same string shipped in the corpus. It was not shown on the run
          page. Now it is, derived here in the browser from the samples on this
          page, so a reader can rederive the label rather than take it. */}
      <FailureNote
        samples={data.samples ?? []}
        scoredDeviationMm={data.deviationMm}
        onSeek={setCursor}
      />

      {/* What would have paid. A run under the floor is told how far under, in
          points — a unit nobody drives in. The same arithmetic backwards names
          the one thing that would have carried it, with the other two terms
          left where this run actually put them. */}
      {data.score < ACCEPT_FLOOR && task ? (
        <WouldHavePaidNote
          score={data.score}
          parts={data.parts}
          parSeconds={task.parSeconds}
        />
      ) : null}

      <RunCertificate trajHash={data.trajHash} />

      <InCorpus taskId={data.taskId} trajHash={data.trajHash} />

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
              payloads={replayProps}
              targetUrl={task.scene.target.url}
              targetWidthMm={task.scene.target.widthMm}
              environmentUrl={task.scene.room.url}
              goal={GOAL}
            />
          </div>
        </>
      ) : null}


      <PhysicsCheck hash={data.trajHash} />

      <DimRule className="mt-10" note="Recorded tool path" />

      {path ? (
        <div className="mt-5 flex flex-col gap-3">
          <svg viewBox="0 0 300 300" className="w-full max-w-[420px] border border-rule bg-ink-0" role="img"
               aria-label={`Path the payload travelled${path.others.length ? `, with ${path.others.length} other accepted runs behind it` : ""}`}>
            {/* Every other accepted run on this task, underneath. */}
            {path.others.map((pts, i) => (
              <polyline key={i} points={pts} fill="none" stroke="var(--color-probe)" strokeWidth="1" opacity={0.28} />
            ))}
            <polyline points={path.full} fill="none" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
            <polyline points={path.trace} fill="none" stroke="var(--color-signal)" strokeWidth="2" />
            <circle cx={path.head[0]} cy={path.head[1]} r="4" fill={path.grip < 14 ? "var(--color-signal)" : "var(--color-probe)"} />
          </svg>
          {path.others.length ? (
            <p className="max-w-[420px] text-[13px] leading-relaxed text-scribe-3">
              <span className="text-probe">The faint lines</span> are the other{" "}
              {path.others.length} accepted run{path.others.length === 1 ? "" : "s"} on this
              task, in the same projection — so whether this route was the usual
              one is a thing you can see rather than take on trust.
            </p>
          ) : null}
          <label className="flex max-w-[420px] items-center gap-3">
            <span className="label shrink-0">Scrub</span>
            <input
              type="range" min={0.02} max={1} step={0.005} value={cursor}
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              onKeyDown={(e) => {
                // Frame-accurate stepping. A range input's own arrow keys move
                // by `step`, which is a fraction of the run and lands between
                // samples; the interesting moments — the frame a grasp forms,
                // the frame a payload is let go — are single frames wide.
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setPlaying(false);
                  step(e.key === "ArrowRight" ? 1 : -1);
                }
              }}
              className="flex-1 accent-signal"
              aria-label="Scrub through the recorded run. Left and right arrows step one frame."
            />
            <span className="w-[86px] shrink-0 text-right font-mono text-[12px] tabular-nums text-scribe-2">
              {path.t.toFixed(1)}s
              <span className="text-scribe-3"> ·{shownIndex + 1}</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              className={cn(
                "border px-2.5 py-1 font-mono text-[12px] transition-colors",
                playing
                  ? "border-signal text-signal"
                  : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe-2",
              )}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => { setPlaying(false); step(-1); }}
              aria-label="Step back one frame"
              className="border border-rule px-2.5 py-1 font-mono text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe-2"
            >
              ◂ frame
            </button>
            <button
              type="button"
              onClick={() => { setPlaying(false); step(1); }}
              aria-label="Step forward one frame"
              className="border border-rule px-2.5 py-1 font-mono text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe-2"
            >
              frame ▸
            </button>
            <span className="label ml-2">Speed</span>
            {[0.25, 0.5, 1, 2, 4].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                aria-pressed={rate === r}
                className={cn(
                  "border px-2 py-1 font-mono text-[12px] tabular-nums transition-colors",
                  rate === r
                    ? "border-signal text-signal"
                    : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe-2",
                )}
              >
                {r}×
              </button>
            ))}
          </div>
          {moments && (moments.grasp !== null || moments.release !== null) ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label">Jump to</span>
              {moments.grasp !== null ? (
                <button
                  type="button"
                  onClick={() => setCursor(Math.max(0.02, (moments.grasp! + 1) / moments.total))}
                  className="border border-rule px-2.5 py-1 font-mono text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe-2"
                >
                  Picked up
                </button>
              ) : null}
              {moments.release !== null ? (
                <button
                  type="button"
                  onClick={() => setCursor(Math.max(0.02, (moments.release! + 1) / moments.total))}
                  className="border border-signal px-2.5 py-1 font-mono text-[12px] text-signal transition-colors hover:bg-signal-dim"
                >
                  Let go &mdash; where placement was decided
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <a
          href={`/api/dataset?traj=${data.trajHash}`}
          className="inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
        >
          Download this run as a LeRobot episode &rarr;
        </a>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
          The same samples the hash above is derived from, shaped the way an
          imitation-learning loader expects &mdash; so you can check the file
          against the chain yourself.
        </p>
      </div>

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

/**
 * Why the run did not work, named.
 *
 * Ordered by how early it went wrong, because a run that never picked the
 * payload up also, trivially, did not place it accurately, and reporting the
 * second is useless. The first thing that failed is the thing to say.
 *
 * Shown on every run, not only the failures. On a run that placed inside the
 * band the answer is that the placement was not the problem — which is a real
 * answer to the question the page invites, and the alternative is a panel that
 * appears only when there is bad news and so reads as an accusation.
 */
function FailureNote({
  samples, scoredDeviationMm, onSeek,
}: {
  samples: ReplaySample[];
  /** The distance this run was actually scored against, as the ledger holds it. */
  scoredDeviationMm: number;
  onSeek: (v: number) => void;
}) {
  const failure = useMemo(
    () => (samples.length >= 2 ? classifyFailure(samples) : null),
    [samples],
  );
  const measured = useMemo(
    () => (samples.length >= 2 ? deviationFromSamples(samples) : null),
    [samples],
  );
  if (!failure || measured === null) return null;

  const clean = failure.kind === "none";
  /**
   * Whether the recording and the figure it was scored with agree.
   *
   * They do on twenty-eight of the thirty episodes here. The two that do not
   * were recorded before the verifier began measuring placement from the
   * samples — one of them was scored at 0.0 mm against a recording that ends
   * 60 mm out, which is exactly the claim that change removed. So the
   * disagreement is not a rounding artefact; it is proof the number did not
   * come from the recording, and it is worth more said than smoothed over.
   */
  const disagrees = Math.abs(measured - scoredDeviationMm) > 0.5;

  return (
    <div className="mt-6 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="label">Where it went wrong</span>
        <span
          className={`font-mono text-[12px] uppercase tracking-[0.12em] ${clean ? "text-go" : "text-reject"}`}
        >
          {failure.kind === "none" ? "not the placement" : failure.kind.replace(/-/g, " ")}
        </span>
      </div>
      <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        {failure.detail}
      </p>
      {failure.atSample !== undefined && samples.length > 1 ? (
        <button
          type="button"
          onClick={() => onSeek(Math.min(1, Math.max(0, failure.atSample! / (samples.length - 1))))}
          className="mt-3 border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe transition-colors hover:border-scribe"
        >
          Go to sample {failure.atSample}
        </button>
      ) : null}
      {disagrees ? (
        <p className="mt-3 max-w-[64ch] border-l-2 border-reject pl-3 text-[13px] leading-relaxed text-scribe-2">
          <span className="text-reject">These samples do not agree with the score.</span>{" "}
          The run was scored against {scoredDeviationMm.toFixed(1)} mm and the
          recording ends {measured.toFixed(1)} mm from its seat. That difference
          is not rounding &mdash; it means the figure it was signed for did not
          come from this recording. Runs from before the verifier began measuring
          placement from the samples carry the number their client sent, and this
          is one of them. It is left as recorded: the payout happened, and
          restating it now would be inventing a second history.
        </p>
      ) : null}

      <p className="mt-3 max-w-[64ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        Derived in this browser from the samples above, not stored beside the
        run &mdash; so it can be rederived rather than taken. The corpus export
        ships the same label against the same episode, which is what makes a
        failure worth training on.
      </p>
    </div>
  );
}

/**
 * What one change would have made this run pay.
 *
 * Built from the parts the ledger stores rather than from the samples, because
 * those are the numbers the score was actually computed from — a target derived
 * from a different measurement than the one that rejected the run would be a
 * target for a different run.
 */
function WouldHavePaidNote({
  score, parts, parSeconds,
}: {
  score: number;
  parts: { placement: number; efficiency: number; smoothness: number };
  parSeconds: number;
}) {
  const w = useMemo(
    () =>
      wouldHavePaid(
        {
          score, success: false, deviationMm: 0, parts,
          raw: { meanJerk: 0, seconds: 0, grasps: 1 }, payoutMon: 0,
        } as never,
        parSeconds,
      ),
    [score, parts, parSeconds],
  );
  if (!w) return null;

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="label">What would have paid</span>
        <span className="font-mono text-[12px] tabular-nums text-reject">
          {((ACCEPT_FLOOR - score) / 100).toFixed(2)} points short of {(ACCEPT_FLOOR / 100).toFixed(2)}
        </span>
      </div>
      <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        {wouldHavePaidSentence(w)}
      </p>
      <p className="mt-2 max-w-[64ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        Each solved with the other two terms held exactly where this run left
        them, so it is what this run needed rather than what a better one would
        have scored.
      </p>
    </div>
  );
}
