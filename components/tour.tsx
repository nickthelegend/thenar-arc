"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePath } from "@/lib/use-path";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { cn } from "@/lib/cn";
import { appChain } from "@/lib/chain";

/**
 * The loop, walked through, for somebody seeing it for the first time.
 *
 * This project's argument only lands in order: a task holds real escrow, an
 * operator drives a real recording, a verifier scores it from the samples, the
 * contract pays for it, and a buyer can check every step without trusting us.
 * Shown out of order it is a site with a lot of numbers on it.
 *
 * So the tour is a route, not a video: each step navigates to the surface it is
 * talking about and says what to look at when you get there. Nothing is staged
 * — every page it visits is the live one with the live figures, and if a task
 * has no runs the tour says so rather than pretending.
 *
 * It lives in the URL (`?tour=3`), so a step can be linked to, reloaded, and
 * left by pressing back. A tour you cannot get out of is a modal.
 */

type Step = {
  /** Where the step happens. A function so it can name a live task. */
  href: (ctx: { taskId: number | null; runHash: string | null }) => string | null;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    href: () => "/hub",
    title: "Work somebody paid for",
    body:
      `Every task here holds real escrow on ${appChain.name}. The slots, the ` +
      "reward per run and the money left are read from the contract on this " +
      "page load — not from a database we control.",
  },
  {
    href: ({ taskId }) => (taskId === null ? null : `/task/${taskId}`),
    title: "What the corpus is actually like",
    body:
      "Score distribution, pass rate over every scored attempt, how much of " +
      "the arm's reachable area the runs have been in, and how different the " +
      "routes are from each other. The uncomfortable figures are here too.",
  },
  {
    href: ({ taskId }) => (taskId === null ? null : `/station/${taskId}`),
    title: "Drive it yourself",
    body:
      "A six-axis arm at true scale in a browser. Press “Practise first” — no " +
      "wallet, no slot used. The placement readout on the right is measured " +
      "live from the same samples the verifier will score.",
  },
  {
    href: ({ runHash }) => (runHash === null ? null : `/run/${runHash}`),
    title: "Check what a payout was for",
    body:
      "One recording, its phases, and the transaction that paid for it. The " +
      "hash is re-derived in your browser from the samples on the page, and " +
      "the corpus proof is walked here against a root read from the chain.",
  },
  {
    href: () => "/foundry",
    title: "Who a licence pays",
    body:
      "When a task fills, its policy mints with the contributor list attached. " +
      "Buying a licence pays that list in the same transaction — no claim step.",
  },
  {
    href: () => "/status",
    title: "What has to be true",
    body:
      "Every condition checked against the live system rather than reported " +
      "from a config file — including the one that is currently failing, and " +
      "why it cannot be repaired.",
  },
];

export function Tour() {
  const params = useSearchParams();
  const pathname = usePath();
  const router = useRouter();
  const { tasks } = useTaskCatalogue();
  const [runHash, setRunHash] = useState<string | null>(null);

  const raw = params.get("tour");
  const step = raw === null ? null : Math.max(0, Math.min(STEPS.length - 1, Number(raw) - 1));
  const active = step !== null && Number.isFinite(step);

  // A real task with runs to look at, and a real run to open. Chosen from the
  // live catalogue rather than pinned, so the tour keeps working after the
  // corpus moves on.
  const taskId = useMemo(() => {
    const filled = (tasks ?? []).filter((t) => t.slotsFilled > 0);
    return filled.length ? filled[0].id : ((tasks ?? [])[0]?.id ?? null);
  }, [tasks]);

  useEffect(() => {
    if (!active || taskId === null) return;
    let live = true;
    fetch(`/api/task/${taskId}/runs`)
      .then((r) => r.json())
      .then((d: { runs?: { traj_hash: string }[] }) => {
        if (live) setRunHash(d.runs?.[0]?.traj_hash ?? null);
      })
      .catch(() => { if (live) setRunHash(null); });
    return () => { live = false; };
  }, [active, taskId]);

  const goto = useCallback((n: number) => {
    const s = STEPS[n];
    const href = s?.href({ taskId, runHash });
    if (!href) return;
    router.push(`${href}?tour=${n + 1}`);
  }, [router, taskId, runHash]);

  const leave = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  /**
   * The nearest step in a direction whose subject exists.
   *
   * A step with nothing to show yet — no paid run, so no run page — is passed
   * over rather than made the end of the tour. Disabling Next there left the
   * foundry and the status page, which always exist, out of reach until
   * somebody had been paid.
   */
  const reachable = useCallback((from: number, dir: 1 | -1): number | null => {
    for (let n = from + dir; n >= 0 && n < STEPS.length; n += dir) {
      if (STEPS[n].href({ taskId, runHash })) return n;
    }
    return null;
  }, [taskId, runHash]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
      if (e.key === "ArrowRight") { const n = reachable(step!, 1); if (n !== null) goto(n); }
      if (e.key === "ArrowLeft") { const n = reachable(step!, -1); if (n !== null) goto(n); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, goto, leave, reachable]);

  if (!active || step === null) return null;
  const s = STEPS[step];
  const next = reachable(step, 1);
  const prev = reachable(step, -1);
  // Steps between here and the next one that have nothing to show yet.
  const skipped = next === null ? [] : STEPS.slice(step + 1, next).map((x, i) => ({ n: step + 2 + i, title: x.title }));

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-rule-strong bg-ink-1/95 backdrop-blur"
      aria-label={`Tour, step ${step + 1} of ${STEPS.length}`}
    >
      <div className="mx-auto flex max-w-[900px] flex-col gap-2 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] tabular-nums text-signal">
            {step + 1}/{STEPS.length}
          </span>
          <span className="font-display text-[16px] leading-tight text-scribe">{s.title}</span>
          <button
            type="button"
            onClick={leave}
            className="ml-auto font-mono text-[12px] text-scribe-3 hover:text-scribe-2"
          >
            close (esc)
          </button>
        </div>

        <p className="max-w-[72ch] text-[14px] leading-relaxed text-scribe-2">{s.body}</p>
        {skipped.length ? (
          <p className="font-mono text-[12px] text-scribe-3">
            Next skips {skipped.map((x) => `step ${x.n}, “${x.title}”`).join(" and ")}: nothing on
            this deployment has reached it yet.
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => prev !== null && goto(prev)}
            disabled={prev === null}
            className={cn(
              "border px-3 py-1.5 text-[12px] transition-colors",
              prev === null
                ? "border-rule text-scribe-3"
                : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
            )}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => next !== null && goto(next)}
            // A step whose subject does not exist yet is never a destination —
            // the tour is only worth anything if every stop is real — and it is
            // skipped with the reason said above, not made a dead end.
            disabled={next === null}
            className={cn(
              "border px-3 py-1.5 text-[12px] transition-colors",
              next === null
                ? "border-rule text-scribe-3"
                : "border-signal bg-signal-dim text-signal-hi hover:bg-signal/20",
            )}
          >
            {step === STEPS.length - 1 ? "That is the loop" : "Next"}
          </button>
          <span className="ml-2 font-mono text-[12px] text-scribe-3">← → to move</span>
        </div>
      </div>
    </aside>
  );
}

/** Starts the tour from wherever the reader is. */
export function StartTour({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/hub?tour=1")}
      className={cn(
        "border border-rule px-3 py-2 text-[12px] text-scribe-3 transition-colors hover:border-signal hover:text-signal",
        className,
      )}
    >
      Show me the loop
    </button>
  );
}
