"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Telemetry } from "@/components/station/viewport";
import { GOAL_R } from "@/components/station/viewport";
import { Announce, Button, CountUp, Difficulty, ToleranceBand } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useRunsOnTask, useTask } from "@/lib/hooks";
import { useSubmitRun } from "@/lib/submit";
import { ACCEPT_FLOOR, evaluate, TOLERANCE_MM } from "@/lib/score";
import { txUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtMon, fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import type { Sample, Verdict } from "@/lib/types";

const StationViewport = dynamic(
  () => import("@/components/station/viewport").then((m) => m.StationViewport),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-ink-0">
        <span className="label">Loading simulation…</span>
      </div>
    ),
  },
);

type Phase = "brief" | "running" | "measured";

const GOAL: [number, number] = [0.17, -0.24];
const START: [number, number] = [0.3, 0.2];

export default function StationPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = Number(params.taskId);
  const valid = Number.isInteger(taskId) && taskId >= 0;

  // isLoading flips true again on every retry, so an unreadable task would
  // flicker between the error and the spinner. The error is the settled state,
  // and the absence of a task is the only thing the spinner needs to know.
  const { data: task, isError } = useTask(valid ? taskId : undefined);
  const { data: myRuns } = useRunsOnTask(valid ? taskId : undefined);
  const s = useSession();
  const tx = useSubmitRun();

  const [phase, setPhase] = useState<Phase>("brief");
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped on every run so the viewport resets its payload and arm. */
  const [runId, setRunId] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const samples = useRef<Sample[]>([]);
  const settledSince = useRef<number | null>(null);
  const startedAt = useRef(0);
  /** The payload starts at rest and ungrasped, so settling only counts once it
   *  has actually been picked up. Without this the run measures itself before
   *  the operator has moved. */
  const everHeld = useRef(false);

  const onSample = useCallback((x: Sample) => { samples.current.push(x); }, []);

  const finish = useCallback(
    (t: Telemetry) => {
      if (!task) return;
      const duration = (performance.now() - startedAt.current) / 1000;
      setVerdict(
        evaluate(
          {
            taskId: String(task.id),
            samples: samples.current,
            durationSeconds: duration,
            success: t.deviationMm <= GOAL_R * 1000,
            deviationMm: t.deviationMm,
          },
          task.parSeconds,
          task.rewardMon,
        ),
      );
      setPhase("measured");
    },
    [task],
  );

  const onTelemetry = useCallback(
    (t: Telemetry) => {
      setTel(t);
      if (phase !== "running") return;

      if (t.held) everHeld.current = true;

      if (everHeld.current && t.settled && !t.held) {
        settledSince.current ??= performance.now();
        if (performance.now() - settledSince.current > 700) finish(t);
      } else {
        settledSince.current = null;
      }
    },
    [phase, finish],
  );

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  // The station is driven entirely by the keyboard, so its help belongs on a key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) { e.preventDefault(); setHelpOpen((v) => !v); }
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = () => {
    samples.current = [];
    settledSince.current = null;
    everHeld.current = false;
    startedAt.current = performance.now();
    setElapsed(0);
    setVerdict(null);
    setTel(null);
    tx.reset();
    setRunId((n) => n + 1);
    setPhase("running");
  };

  if (!valid || isError) {
    return (
      <Missing id={params.taskId} reason={isError ? "chain" : "id"} />
    );
  }

  if (!task) {
    return (
      <div className="flex h-dvh items-center justify-center bg-ink-1">
        <span className="font-mono text-[13px] text-scribe-3">
          Reading task #{taskId} from the chain…
        </span>
      </div>
    );
  }

  // Spoken status for the submit flow, which was silent to a screen reader.
  const announcement =
    tx.phase === "verifying" ? "Verifying the run."
    : tx.phase === "signing" ? "Waiting for you to confirm in your wallet."
    : tx.phase === "pending" ? "Transaction sent. Waiting for the block."
    : tx.phase === "confirmed" ? `Run recorded and paid. ${fmtMon(tx.paidMon ?? 0)} MON.`
    : tx.phase === "error" ? `Submission failed. ${tx.error ?? ""}`
    : verdict ? `Measurement taken. ${verdict.success ? "In tolerance" : "Out of tolerance"}, score ${fmtScore(verdict.score)}.`
    : null;

  const capped = (myRuns ?? 0) >= 5;
  const accepted = verdict?.success ?? false;
  // Measured on this chain: a submit reserves roughly 0.03 MON against the gas
  // limit regardless of what it spends, and Monad rejects the transaction
  // outright below that. Warn before the wallet does.
  const RESERVE_FLOOR = 0.05;
  const thinOnGas = s.connected && !s.wrongNetwork && s.balance < RESERVE_FLOOR;

  return (
    <div className="flex min-h-dvh flex-col bg-ink-1 lg:h-dvh lg:overflow-hidden">
      <Announce message={announcement} />
      <header className="flex shrink-0 items-stretch border-b border-rule">
        <Link
          href="/hub"
          className="flex items-center gap-2 border-r border-rule px-4 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3 transition-colors hover:text-scribe"
        >
          ← Hub
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
          <span className="shrink-0 font-mono text-[12px] text-scribe-3">#{task.id}</span>
          <h1 className="truncate font-display text-lg font-600 leading-none">{task.name}</h1>
        </div>
        <div className="hidden items-center gap-5 border-l border-rule px-4 md:flex">
          <Stat label="Elapsed" value={fmtSeconds(elapsed)} />
          <Stat label="Par" value={fmtSeconds(task.parSeconds)} tone="dim" />
          <Stat label="Your runs" value={`${myRuns ?? 0} / 5`} tone={capped ? "warn" : "dim"} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[300px_1fr_308px] lg:grid-rows-[1fr]">
        <aside className="order-2 flex flex-col border-rule lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r">
          <Section title="Goal">
            <p className="text-[14px] leading-relaxed text-scribe-2">
              {task.name}. Bring the payload to rest inside the datum circle.
            </p>
          </Section>
          <Section title="Controls">
            <dl className="flex flex-col gap-1.5">
              <Key keys={["Drag"]} action="Move the tool in the workspace" />
              <Key keys={["W", "S"]} action="Reach out / pull in" />
              <Key keys={["A", "D"]} action="Swing left / right" />
              <Key keys={["E", "Q"]} action="Raise / lower" />
              <Key keys={["Space"]} action="Open / close the jaws" />
              <Key keys={["?"]} action="All controls" />
            </dl>
          </Section>
          <Section title="Settlement">
            <p className="text-[13px] leading-relaxed text-scribe-2">
              One transaction records the trajectory hash, its task, your address
              and the verified score — and transfers the MON. There is no separate
              signing step.
            </p>
          </Section>
        </aside>

        <div className="relative order-1 h-[52dvh] lg:order-2 lg:h-auto lg:min-h-0">
          <StationViewport
            running={phase === "running"}
            goal={GOAL}
            start={START}
            runId={runId}
            onTelemetry={onTelemetry}
            onSample={onSample}
          />

          {tel && phase !== "brief" ? (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-x-6 gap-y-1 border-t border-rule bg-ink-1/92 px-4 py-2 font-mono text-[12px] tabular-nums">
              <span className="text-scribe-3">X <span className="text-scribe">{tel.tool[0].toFixed(3)}</span></span>
              <span className="text-scribe-3">Y <span className="text-scribe">{tel.tool[1].toFixed(3)}</span></span>
              <span className="text-scribe-3">Z <span className="text-scribe">{tel.tool[2].toFixed(3)}</span></span>
              <span className="text-scribe-3">JAW <span className="text-scribe">{tel.grip.toFixed(0)}</span> mm</span>
              <span className={cn(tel.held ? "text-signal" : "text-scribe-3")}>
                {tel.held ? "PAYLOAD HELD" : "JAWS EMPTY"}
              </span>
              {/* Without this the operator is hunting for the payload blind:
                  the capture volume is invisible, so nothing says whether
                  closing the jaws will do anything. */}
              {!tel.held ? (
                tel.inRange ? (
                  <span className="text-go">IN RANGE — PRESS SPACE</span>
                ) : (
                  <span className="text-scribe-3">
                    PAYLOAD <span className="text-scribe">{tel.payloadDist.toFixed(2)}</span> m
                  </span>
                )
              ) : null}
              {tel.joints.clamped ? <span className="ml-auto text-reject">OUT OF REACH</span> : null}
            </div>
          ) : null}

          {helpOpen ? (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-ink-0/90 px-6"
              onClick={() => setHelpOpen(false)}
            >
              <div className="w-full max-w-sm border border-rule-strong bg-ink-1 px-5 py-4">
                <h2 className="font-display text-lg font-600">Controls</h2>
                <dl className="mt-4 flex flex-col gap-2">
                  <Key keys={["Drag"]} action="Move the tool in the workspace" />
                  <Key keys={["W", "S"]} action="Reach out / pull in" />
                  <Key keys={["A", "D"]} action="Swing left / right" />
                  <Key keys={["↑", "↓", "←", "→"]} action="The same, on the arrows" />
                  <Key keys={["E", "Q"]} action="Raise / lower" />
                  <Key keys={["Space"]} action="Open / close the jaws" />
                  <Key keys={["?"]} action="Show or hide this" />
                  <Key keys={["Esc"]} action="Close" />
                </dl>
                <p className="mt-4 text-[13px] leading-relaxed text-scribe-3">
                  A run is measured once the payload has been picked up and let
                  go again, so nothing is scored until you have actually moved it.
                </p>
              </div>
            </div>
          ) : null}

          {phase === "running" ? (
            <button
              onClick={() => tel && finish(tel)}
              className="absolute right-4 top-4 border border-rule-strong bg-ink-1/90 px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-2 transition-colors hover:border-scribe hover:text-scribe"
            >
              End run
            </button>
          ) : null}

          {phase === "brief" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-0/78 px-6">
              <div className="max-w-sm text-center">
                <h2 className="font-display text-2xl font-600">Ready to record</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-scribe-2">
                  The timer starts on your first frame. Pick the payload up, bring
                  it to rest inside the datum circle, and let go — the measurement
                  is taken automatically once it settles.
                </p>
                {capped ? (
                  <p className="mt-4 border border-reject bg-reject-dim px-3 py-2 text-[13px] text-reject">
                    You have used all 5 of your runs on this task. Another run will
                    record, but the chain will refuse to pay it.
                  </p>
                ) : null}
                {!task.open ? (
                  <p className="mt-4 border border-reject bg-reject-dim px-3 py-2 text-[13px] text-reject">
                    This task has no slots left.
                  </p>
                ) : null}
                <Button variant="primary" className="mt-6" onClick={start}>Begin run</Button>
              </div>
            </div>
          ) : null}

          {phase === "measured" && verdict ? (
            <MeasurementSnap
              verdict={verdict}
              accepted={accepted}
              session={s}
              thinOnGas={thinOnGas}
              tx={tx}
              onSubmit={() =>
                tx.submit({
                  taskId: task.id,
                  samples: samples.current,
                  durationSeconds: Number(elapsed.toFixed(3)),
                  deviationMm: verdict.deviationMm,
                  success: verdict.success,
                })
              }
              onAgain={start}
              onLeave={() => router.push("/hub")}
            />
          ) : null}
        </div>

        <aside className="order-3 flex flex-col border-rule lg:min-h-0 lg:overflow-y-auto lg:border-l">
          <Section title="This task">
            <div className="flex flex-col gap-3">
              <Row label="Scenario" value={task.scenario} />
              <div className="flex items-center justify-between">
                <span className="label">Difficulty</span>
                <Difficulty level={task.difficulty} />
              </div>
              <Row label="Per run" value={`${fmtMon(task.rewardMon)} MON`} tone="signal" />
              <Row label="Slots left" value={String(task.slotsTotal - task.slotsFilled)} />
              <Row label="Escrow" value={`${fmtMon(Number(task.escrowWei) / 1e18, 3)} MON`} />
            </div>
          </Section>

          <Section title="Live placement">
            {tel ? (
              <ToleranceBand deviationMm={tel.deviationMm} toleranceMm={TOLERANCE_MM} label="Deviation from datum" />
            ) : (
              <p className="text-[13px] text-scribe-3">Begin the run to take a live reading.</p>
            )}
          </Section>

          <Section title="How this is scored">
            <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-scribe-2">
              <li><span className="text-scribe">Placement, 55%</span> — distance from the datum at rest, inside ±{TOLERANCE_MM} mm.</li>
              <li><span className="text-scribe">Smoothness, 25%</span> — mean jerk of the tool path.</li>
              <li><span className="text-scribe">Efficiency, 20%</span> — your time against par, {fmtSeconds(task.parSeconds)}.</li>
              <li className="pt-1 text-scribe-3">
                The server re-scores every run and signs the result; the contract
                will not pay a score it did not sign. Below {fmtScore(ACCEPT_FLOOR)} a run pays nothing.
              </li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function MeasurementSnap({
  verdict, accepted, session: s, tx, thinOnGas, onSubmit, onAgain, onLeave,
}: {
  verdict: Verdict;
  accepted: boolean;
  session: ReturnType<typeof useSession>;
  tx: ReturnType<typeof useSubmitRun>;
  thinOnGas: boolean;
  onSubmit: () => void;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const RESERVE_FLOOR = 0.05;
  const busy = tx.phase === "verifying" || tx.phase === "signing" || tx.phase === "pending";
  const done = tx.phase === "confirmed";

  const label =
    tx.phase === "verifying" ? "Verifying the run…"
    : tx.phase === "signing" ? "Confirm in your wallet…"
    : tx.phase === "pending" ? "Waiting for the block…"
    : s.wrongNetwork ? "Switch to Monad Testnet"
    : !s.connected ? "Connect a wallet to get paid"
    : "Submit and get paid";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-ink-0/88 px-6 py-6">
      <div className="w-full max-w-[460px] border border-rule-strong bg-ink-1">
        <div className={cn(
          "flex items-baseline justify-between border-b px-5 py-3",
          accepted ? "border-go bg-go-dim" : "border-reject bg-reject-dim",
        )}>
          <span className={cn("font-display text-xl font-600 tracking-[0.04em]", accepted ? "text-go" : "text-reject")}>
            {accepted ? "IN TOLERANCE" : "OUT OF TOLERANCE"}
          </span>
          <span className="font-mono text-[13px] tabular-nums text-scribe-2">
            {fmtScore(verdict.score)}<span className="ml-1 text-[12px] text-scribe-3">/ 100.00</span>
          </span>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <ToleranceBand deviationMm={verdict.deviationMm} toleranceMm={TOLERANCE_MM} label="Final placement" />

          <div className="grid grid-cols-3 gap-px bg-rule">
            {(
              [
                ["Placement", verdict.parts.placement, `${Math.abs(verdict.deviationMm).toFixed(1)} mm`],
                ["Smoothness", verdict.parts.smoothness, `${verdict.raw.meanJerk.toFixed(1)} m/s³`],
                ["Efficiency", verdict.parts.efficiency, fmtSeconds(verdict.raw.seconds)],
              ] as const
            ).map(([l, v, raw]) => (
              <div key={l} className="flex flex-col gap-1 bg-ink-1 py-2">
                <span className="label">{l}</span>
                <span className="font-mono text-[15px] tabular-nums text-scribe">
                  {(v * 100).toFixed(0)}<span className="ml-0.5 text-[12px] text-scribe-3">%</span>
                </span>
                <span className="font-mono text-[12px] tabular-nums text-scribe-3">{raw}</span>
              </div>
            ))}
          </div>

          {accepted ? (
            <div className="flex items-end justify-between border-t border-rule pt-4">
              <span className="label">{done ? "Paid to your wallet" : "Payable on submit"}</span>
              <span className="font-mono text-4xl font-medium leading-none tracking-[-0.02em] text-signal">
                {done ? <CountUp to={tx.paidMon ?? verdict.payoutMon} /> : fmtMon(verdict.payoutMon)}
                <span className="ml-1.5 text-[12px] text-scribe-3">MON</span>
              </span>
            </div>
          ) : (
            <p className="border-t border-rule pt-4 text-[13px] leading-relaxed text-scribe-2">
              The payload came to rest outside the datum circle, so this run pays
              nothing and does not enter the training pool. Nothing was deducted —
              run it again.
            </p>
          )}

          {done && tx.txHash ? (
            <div className="flex flex-col gap-1.5 border-t border-rule pt-3 font-mono text-[12px] text-scribe-3">
              <span>
                Recorded and paid in one transaction ·{" "}
                <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                  {shortHash(tx.txHash)}
                </a>
              </span>
              <span className="flex flex-wrap gap-x-4">
                <span>settled in <span className="text-scribe-2 tabular-nums">{((tx.blockMs ?? 0) / 1000).toFixed(2)}s</span></span>
                <span>gas <span className="text-scribe-2 tabular-nums">{(tx.gasMon ?? 0).toFixed(6)}</span> MON</span>
              </span>
            </div>
          ) : null}

          {thinOnGas && !done ? (
            <p className="border border-signal bg-signal-dim px-3 py-2 text-[13px] leading-relaxed text-signal">
              Your balance is {fmtMon(s.balance, 4)} MON. Monad reserves against
              the whole gas limit, so a submit needs roughly {RESERVE_FLOOR} MON
              on hand even though it spends a fraction of that.{" "}
              <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer" className="underline">
                Top up
              </a>
              .
            </p>
          ) : null}

          {tx.phase === "error" && tx.error ? (
            <p role="alert" className="border border-reject bg-reject-dim px-3 py-2 text-[13px] text-reject">
              {tx.error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-stretch gap-px border-t border-rule bg-rule">
          {accepted && !done ? (
            s.wrongNetwork ? (
              <Button variant="primary" className="flex-1" onClick={s.switchToMonad}>{label}</Button>
            ) : !s.connected ? (
              <Button variant="primary" className="flex-1" onClick={s.connect}>{label}</Button>
            ) : (
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy}
                onClick={(e) => {
                  // A fast double click can fire twice before React re-renders,
                  // and each one is a real transaction.
                  (e.currentTarget as HTMLButtonElement).disabled = true;
                  onSubmit();
                }}
              >
                {label}
              </Button>
            )
          ) : null}
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={onAgain}>Run again</Button>
          <Button variant="ghost" className="flex-1 bg-ink-1" disabled={busy} onClick={onLeave}>Back to hub</Button>
        </div>
      </div>
    </div>
  );
}

function Missing({ id, reason }: { id: string; reason: "id" | "chain" }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="font-display text-3xl">
        {reason === "chain" ? "Could not read that task" : "No such task"}
      </h1>
      <p className="mt-2 text-scribe-2">
        {reason === "chain"
          ? `Task ${id} could not be read from the contract. It may not exist yet.`
          : `"${id}" is not a task id. Tasks are numbered from zero.`}
      </p>
      <Link href="/hub" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
        Back to the hub
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-rule px-4 py-4">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[13px] capitalize tabular-nums", tone === "signal" ? "text-signal" : "text-scribe")}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "dim" | "warn" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[13px] tabular-nums", tone === "warn" ? "text-reject" : tone === "dim" ? "text-scribe-2" : "text-scribe")}>{value}</span>
    </span>
  );
}

function Key({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 gap-1">
        {keys.map((k) => (
          <kbd key={k} className="min-w-[22px] border border-rule-strong bg-ink-3 px-1.5 py-0.5 text-center font-mono text-[12px] text-scribe-2">{k}</kbd>
        ))}
      </dt>
      <dd className="text-[12px] text-scribe-3">{action}</dd>
    </div>
  );
}
