"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DimRule } from "@/components/primitives";
import { fmtDate, fmtInt, fmtMon, fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import { CURRENCY } from "@/lib/chain";
import { CorpusAccessPanel } from "@/components/corpus-access";
import { useTaskCatalogue, type TaskWithScene } from "@/components/tasks-provider";
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

  /**
   * What the chosen task holds under every outcome, fetched only when the
   * chosen filter came back empty.
   *
   * An empty list is the buyer's most consequential screen and it said the
   * least: four zeros and one sentence that fitted every possible reason. There
   * is a large difference between "nobody has driven this task" and "two people
   * have and neither cleared the floor", and only the second is a reason to
   * come back later. The distinction is one request away and was never made.
   */
  const [why, setWhy] = useState<{ key: string; episodes: Episode[] } | null>(null);
  const empty = Boolean(data) && data!.episodes.length === 0;

  useEffect(() => {
    if (!empty) return;
    let live = true;
    // Already the unfiltered question, so its own answer is the explanation.
    // Deferred rather than set here: writing state synchronously from an effect
    // makes React render again before it has painted the render it is in, which
    // is the rule the locale, XR and palette paths in this codebase all follow.
    if (outcome === "all") {
      const t = setTimeout(() => { if (live) setWhy({ key, episodes: [] }); }, 0);
      return () => { live = false; clearTimeout(t); };
    }
    const q = new URLSearchParams({ outcome: "all" });
    if (taskId !== "all") q.set("taskId", String(taskId));
    fetch(`/api/corpus?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { episodes: Episode[] }) => { if (live) setWhy({ key, episodes: d.episodes }); })
      .catch(() => { if (live) setWhy({ key, episodes: [] }); });
    return () => { live = false; };
  }, [empty, outcome, taskId, key]);

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

      {/* The gate answers 402 and, until now, pointed nowhere. */}
      <CorpusAccessPanel />

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
        <EmptyCorpus
          outcome={outcome}
          task={taskId === "all" ? undefined : tasks?.find((t) => t.id === taskId)}
          taskId={taskId}
          floor={data.floor}
          all={why?.key === key ? why.episodes : null}
          onShowEverything={() => setOutcome("all")}
        />
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

/**
 * Why there is nothing here, and what would change it.
 *
 * Written for the person deciding whether to pay for this corpus. "Nothing yet"
 * is true of an unworked task, a task everybody failed, and a task whose runs
 * were driven but never signed, and those are three different answers to
 * "should I come back". So it counts what the task actually holds and says
 * which one it is.
 *
 * Nothing here is inferred. The breakdown is the same endpoint asked without
 * the outcome filter, and the slots and the rate are the catalogue's, read from
 * the contract like everywhere else.
 */
function EmptyCorpus({
  outcome, task, taskId, floor, all, onShowEverything,
}: {
  outcome: (typeof OUTCOMES)[number]["key"];
  task: TaskWithScene | undefined;
  taskId: number | "all";
  floor: number;
  all: Episode[] | null;
  onShowEverything: () => void;
}) {
  const where = taskId === "all" ? "in the corpus" : `on task #${taskId}`;

  // Still asking. Said rather than shown as a blank, because a buyer staring at
  // an empty list wants to know whether it is empty or still arriving.
  if (outcome !== "all" && all === null) {
    return (
      <p className="mt-4 max-w-[64ch] font-mono text-[13px] text-scribe-3">
        Nothing under that filter. Checking what{" "}
        {taskId === "all" ? "the corpus" : `task #${taskId}`} holds&hellip;
      </p>
    );
  }

  const counts = {
    paid: (all ?? []).filter((e) => e.outcome === "paid").length,
    failed: (all ?? []).filter((e) => e.outcome === "failed").length,
    unsubmitted: (all ?? []).filter((e) => e.outcome === "unsubmitted").length,
  };
  const total = counts.paid + counts.failed + counts.unsubmitted;

  return (
    <div className="mt-4 max-w-[64ch]">
      {total === 0 ? (
        <>
          <p className="text-[14px] leading-relaxed text-scribe-2">
            {taskId === "all"
              ? "Nothing has been driven yet, anywhere in the corpus."
              : `Nobody has driven task #${taskId} yet.`}{" "}
            Every episode here is a run a person actually recorded, so an empty
            list is a statement about the work rather than about the index.
          </p>
          {task ? (
            <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
              Task #{task.id} has {fmtInt(Math.max(0, task.slotsTotal - task.slotsFilled))}{" "}
              {task.slotsTotal - task.slotsFilled === 1 ? "slot" : "slots"} unfilled at{" "}
              {fmtMon(task.rewardMon)} {CURRENCY} a run.{" "}
              <Link href={`/station/${task.id}`} className="text-signal hover:text-signal-hi">
                Drive it &rarr;
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-scribe-2">
            {fmtInt(total)} {total === 1 ? "recording" : "recordings"} {where}, and{" "}
            {outcome === "paid"
              ? total === 1
                ? `it did not clear the ${fmtScore(floor)} a run has to reach to be paid`
                : `not one of them cleared the ${fmtScore(floor)} a run has to reach to be paid`
              : outcome === "failed"
                ? total === 1
                  ? `it cleared that floor`
                  : `every one of them cleared that floor`
                : total === 1
                  ? `its operator signed and sent it`
                  : `every operator signed and sent theirs`}
            {" — so there is nothing under this filter."}
          </p>
          <p className="mt-2 font-mono text-[12px] text-scribe-3">
            {counts.paid} paid &middot; {counts.failed} below the floor &middot;{" "}
            {counts.unsubmitted} never sent
          </p>
          <button
            type="button"
            onClick={onShowEverything}
            className="mt-3 border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe transition-colors hover:border-scribe"
          >
            Show everything {taskId === "all" ? "" : `on #${taskId}`}
          </button>
        </>
      )}
    </div>
  );
}
