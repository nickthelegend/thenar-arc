"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DimRule } from "@/components/primitives";
import { fmtDate, fmtInt, fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { cn } from "@/lib/cn";

/**
 * Everything this deployment has recorded, in one place.
 *
 * The task pages answer "what is in this task". Nobody could answer "what is
 * in the corpus" without opening all of them and adding up — which is the
 * question anyone deciding whether to licence any of it actually has.
 *
 * The failures are here, labelled, and so are the runs nobody submitted. A
 * list that quietly showed only the paid ones would be the survivorship filter
 * this project just took the trouble to remove.
 */

type Episode = {
  trajHash: string; taskId: number; contributor: string; score: number;
  deviationMm: number; durationSeconds: number; frames: number;
  createdAt: number; outcome: "paid" | "failed" | "unsubmitted"; txHash: string | null;
};

const OUTCOMES = [
  { key: "all", label: "Everything" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Below the floor" },
  { key: "unsubmitted", label: "Never sent" },
] as const;

const TONE: Record<Episode["outcome"], string> = {
  paid: "text-go",
  failed: "text-reject",
  unsubmitted: "text-scribe-3",
};

export default function CorpusPage() {
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["key"]>("all");
  const [taskId, setTaskId] = useState<number | "all">("all");
  /**
   * The answer, tagged with the question it answers.
   *
   * Clearing the result at the top of the effect would be setting state
   * synchronously from inside one, which makes React render again before it
   * has painted the render it is in — the rule this codebase follows in the
   * locale, XR and palette paths. Tagging instead means "still loading" is a
   * comparison rather than a write: the data on hand either belongs to the
   * filter on screen or it does not.
   */
  const [answer, setAnswer] = useState<
    { key: string; data: { episodes: Episode[]; floor: number } | null } | null
  >(null);
  const { tasks } = useTaskCatalogue();

  const key = `${outcome}:${taskId}`;
  const data = answer?.key === key ? answer.data : null;
  const failed = answer?.key === key && answer.data === null;

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ outcome });
    if (taskId !== "all") q.set("taskId", String(taskId));
    fetch(`/api/corpus?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setAnswer({ key: `${outcome}:${taskId}`, data: d }); })
      .catch(() => { if (live) setAnswer({ key: `${outcome}:${taskId}`, data: null }); });
    return () => { live = false; };
  }, [outcome, taskId]);

  const totals = useMemo(() => {
    const e = data?.episodes ?? [];
    return {
      frames: e.reduce((n, x) => n + x.frames, 0),
      seconds: e.reduce((n, x) => n + x.durationSeconds, 0),
      operators: new Set(e.map((x) => x.contributor)).size,
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none">The corpus</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        Every recording this deployment holds, across every task — the ones that
        were paid for, the ones that scored too low, and the ones whose operator
        never signed. Each links to the run it came from, where the hash can be
        re-derived and checked against the chain.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Episodes</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">
            {data ? fmtInt(data.episodes.length) : "—"}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Frames</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">
            {data ? fmtInt(totals.frames) : "—"}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Recorded</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">
            {data ? fmtSeconds(Math.round(totals.seconds)) : "—"}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Operators</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">
            {data ? fmtInt(totals.operators) : "—"}
          </span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label w-[72px] shrink-0">Outcome</span>
          {OUTCOMES.map((o) => (
            <Chip key={o.key} on={outcome === o.key} onClick={() => setOutcome(o.key)}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label w-[72px] shrink-0">Task</span>
          <Chip on={taskId === "all"} onClick={() => setTaskId("all")}>All</Chip>
          {(tasks ?? []).map((t) => (
            <Chip key={t.id} on={taskId === t.id} onClick={() => setTaskId(t.id)}>
              #{t.id}
            </Chip>
          ))}
        </div>
      </div>

      <DimRule className="mt-6" note={data ? `${data.episodes.length} shown` : "Reading"} />

      {failed ? (
        <p className="mt-4 font-mono text-[13px] text-reject">
          The corpus index could not be read. The task pages still work.
        </p>
      ) : !data ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="hatch h-9" />)}
        </ul>
      ) : data.episodes.length === 0 ? (
        <p className="mt-4 max-w-[62ch] font-mono text-[13px] text-scribe-3">
          Nothing recorded under that filter yet. Every episode here is a real
          run somebody drove, so an empty list means nobody has driven one.
        </p>
      ) : (
        <ol className="mt-2">
          {data.episodes.map((e) => (
            <li key={e.trajHash} className="border-b border-rule">
              <Link
                href={`/run/${e.trajHash}`}
                className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1 py-3 transition-colors hover:bg-ink-2 sm:grid-cols-[56px_1fr_auto_auto_auto_auto]"
              >
                <span className="font-mono text-[12px] text-scribe-3">#{e.taskId}</span>
                <span className="font-mono text-[13px] text-scribe-2">{shortHash(e.trajHash)}</span>
                <span className={cn("font-mono text-[12px] uppercase tracking-[0.12em]", TONE[e.outcome])}>
                  {e.outcome === "unsubmitted" ? "not sent" : e.outcome}
                </span>
                <span className="text-right font-mono text-[13px] tabular-nums text-scribe">
                  {fmtScore(e.score)}
                </span>
                <span className="text-right font-mono text-[12px] tabular-nums text-scribe-3">
                  {fmtInt(e.frames)} f
                </span>
                <span className="text-right font-mono text-[12px] text-scribe-3">
                  {fmtDate(e.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "border px-2.5 py-1 font-mono text-[12px] transition-colors",
        on ? "border-signal bg-signal-dim text-signal-hi" : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe-2",
      )}
    >
      {children}
    </button>
  );
}
