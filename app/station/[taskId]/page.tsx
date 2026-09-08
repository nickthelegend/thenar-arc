"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Telemetry } from "@/components/station/viewport";
import { GOAL_R } from "@/components/station/viewport";
import { Announce, Button, CountUp, Difficulty, ScoreDial, ToleranceBand } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useSpace } from "@/lib/space";
import { environmentForScenario, lightingFor } from "@/lib/environments";
import { SKILL_LABEL } from "@/lib/skills";
import { useRunsOnTask } from "@/lib/hooks";
import { useTaskCatalogue, useCatalogueTask } from "@/components/tasks-provider";
import { useSubmitRun } from "@/lib/submit";
import { ACCEPT_FLOOR, evaluate, TOLERANCE_MM } from "@/lib/score";
import { shortfalls, belowFloorBy } from "@/lib/shortfall";
import { saveDraft, loadDraft, clearDraft } from "@/lib/run-draft";
import { readTally, noteMeasured, notePaid, meanScore, minutes, type Tally } from "@/lib/session-tally";
import { soundOn, setSound } from "@/lib/click";
import { txUrl, CURRENCY, FAUCET_URL } from "@/lib/chain";
import { propsForTask } from "@/lib/props";
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

// Both sit in the comfortable middle of the arm's envelope. START used to be at
// 0.361 m against a 0.408 m maximum — 88% of full reach, where the elbow is
// nearly straight, the IK looks stretched and small pointer movements swing the
// tool a long way. The pair are still 0.33 m apart, so the task is a real
// transfer rather than a nudge, and both objects sit inside the camera frame
// with the arm rather than out at the edges of the table.
const GOAL: [number, number] = [0.16, -0.18];
const START: [number, number] = [0.22, 0.14];

/**
 * What the viewport draws for the one frame before the catalogue answers.
 *
 * Not a stand-in for a task: the page renders its loading state until `task`
 * exists, and this only keeps the Canvas from being handed empty URLs while
 * that is true.
 */
const FALLBACK_SCENE = {
  ...propsForTask("", "general"),
  room: environmentForScenario("general"),
};

export default function StationPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = Number(params.taskId);
  const valid = Number.isInteger(taskId) && taskId >= 0;

  // isLoading flips true again on every retry, so an unreadable task would
  // flicker between the error and the spinner. The error is the settled state,
  // and the absence of a task is the only thing the spinner needs to know.
  const { isError, isLoading } = useTaskCatalogue();
  const task = useCatalogueTask(valid ? taskId : undefined);
  const { data: myRuns } = useRunsOnTask(valid ? taskId : undefined);
  const s = useSession();
  // Presence in this task's room. It never touches the measurement: the
  // trajectory is recorded and signed exactly as it is with the room empty.
  const { ghosts, report } = useSpace(taskId, s.address, valid);
  const tx = useSubmitRun();

  const [phase, setPhase] = useState<Phase>("brief");
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped on every run so the viewport resets its payload and arm. */
  // The objects the instruction names, so the viewport renders the task rather
  // than an anonymous puck.
  // The scene comes from the catalogue, which derives it once for the whole
  // app. The hub, the floor, the task page and this station therefore cannot
  // disagree about what a task looks like — they used to each resolve it.
  const scene = task?.scene ?? FALLBACK_SCENE;
  const room = scene.room;

  const [runId, setRunId] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  // Read after mount: localStorage is not available during the server render.
  const [sound, setSoundState] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSoundState(soundOn()), 0);
    return () => clearTimeout(t);
  }, []);

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

  // A measured run is real work that has not been paid yet, and the wallet
  // prompt between here and the chain is where runs were being lost.
  useEffect(() => {
    if (phase !== "measured" || !verdict || !task) return;
    saveDraft({
      taskId: task.id,
      samples: samples.current,
      verdict,
      durationSeconds: verdict.raw.seconds,
      at: Date.now(),
    });
  }, [phase, verdict, task]);

  // Once the chain has it, the draft is not an unsent run any more.
  useEffect(() => {
    if (tx.phase === "confirmed") clearDraft();
  }, [tx.phase]);

  // This sitting's tally. Sessions here are long and repetitive, and the
  // interface only ever showed one run at a time.
  const [tally, setTally] = useState<Tally | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTally(readTally()), 0);
    return () => clearTimeout(t);
  }, []);

  const countedMeasured = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "measured" || !verdict) return;
    // Once per measurement, not once per render of it.
    const key = `${runId}:${verdict.score}`;
    if (countedMeasured.current === key) return;
    countedMeasured.current = key;
    setTally(noteMeasured(verdict.score));
  }, [phase, verdict, runId]);

  const countedPaid = useRef<string | null>(null);
  useEffect(() => {
    if (tx.phase !== "confirmed" || !tx.txHash) return;
    if (countedPaid.current === tx.txHash) return;
    countedPaid.current = tx.txHash;
    setTally(notePaid(tx.paidMon ?? 0));
  }, [tx.phase, tx.txHash, tx.paidMon]);

  // Offer it back once, on arrival, if this tab was interrupted mid-flow.
  const [recovered, setRecovered] = useState<ReturnType<typeof loadDraft>>(null);
  useEffect(() => {
    if (!task || phase !== "brief") return;
    const t = setTimeout(() => setRecovered(loadDraft(task.id)), 0);
    return () => clearTimeout(t);
  }, [task, phase]);

  const onTelemetry = useCallback(
    (t: Telemetry) => {
      setTel(t);
      report(t.tool, t.grip, t.held);
      if (phase !== "running") return;

      if (t.held) everHeld.current = true;

      if (everHeld.current && t.settled && !t.held) {
        settledSince.current ??= performance.now();
        if (performance.now() - settledSince.current > 700) finish(t);
      } else {
        settledSince.current = null;
      }
    },
    [phase, finish, report],
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
    // The button that started the run keeps focus, and space activates a
    // focused button. Drop focus so the jaws get the key, not the control.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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

  // Only a catalogue still in flight is worth waiting on. Once it has answered
  // and the task is still not in it, the id does not exist — and saying
  // "reading from the chain…" for ever is a lie about what is happening.
  if (!task) {
    return isLoading ? (
      <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-ink-1">
        {/* The instrument coming up, rather than a word. Each segment settles in
            turn, so the wait reads as the arm being assembled from the chain's
            own answer instead of as a page that has stopped. */}
        <svg width="132" height="96" viewBox="0 0 132 96" role="img"
             aria-label={`Reading task ${taskId} from the chain`}>
          <line x1="20" y1="88" x2="112" y2="88" stroke="#262626" strokeWidth="2" />
          {[
            { d: "M34 88 L34 62", delay: 0 },
            { d: "M34 62 L66 40", delay: 180 },
            { d: "M66 40 L98 52", delay: 360 },
            { d: "M98 52 L98 40", delay: 540 },
          ].map((seg) => (
            <path
              key={seg.d}
              d={seg.d}
              stroke="#FF6A00"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: `thenar-draw 1.6s ${seg.delay}ms cubic-bezier(0.16,1,0.3,1) infinite`,
              }}
            />
          ))}
          <circle cx="34" cy="88" r="4" fill="#3D3D3D" />
        </svg>
        <span className="font-mono text-[13px] text-scribe-3">
          Reading task #{taskId} from the chain…
        </span>
      </div>
    ) : (
      <Missing id={params.taskId} reason="absent" />
    );
  }

  // Spoken status for the submit flow, which was silent to a screen reader.
  const announcement =
    tx.phase === "verifying" ? "Verifying the run."
    : tx.phase === "signing" ? "Waiting for you to confirm in your wallet."
    : tx.phase === "pending" ? "Transaction sent. Waiting for the block."
    : tx.phase === "confirmed" ? `Run recorded and paid. ${fmtMon(tx.paidMon ?? 0)} ${CURRENCY}.`
    : tx.phase === "error" ? `Submission failed. ${tx.error ?? ""}`
    : verdict ? `Measurement taken. ${verdict.success ? "In tolerance" : "Out of tolerance"}, score ${fmtScore(verdict.score)}.`
    : null;

  const capped = (myRuns ?? 0) >= 5;
  const accepted = verdict?.success ?? false;

  /**
   * A run the chain will not pay for, decided before it starts.
   *
   * Driving a full task already worked — the button was never disabled — but it
   * was framed as a warning to click past rather than as something you might
   * deliberately want. Anyone can practise: no wallet, no slot consumed, the
   * same scene and the same measurement, just no transaction at the end.
   */
  const practice = !task.open || capped;
  // Measured on this chain: a submit reserves roughly 0.03 AVAX against the gas
  // limit regardless of what it spends, and the chain rejects the transaction
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
              <Key keys={["W", "S", "\u2191", "\u2193"]} action="Reach out / pull in" />
              <Key keys={["A", "D", "\u2190", "\u2192"]} action="Swing left / right" />
              <Key keys={["E", "Q"]} action="Raise / lower" />
              <Key keys={["Space"]} action="Open / close the jaws" />
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setSound(!sound); setSoundState(!sound); }}
                  aria-pressed={sound}
                  className="border border-rule-strong px-1.5 py-0.5 font-mono text-[12px] text-scribe-2"
                >
                  {sound ? "On" : "Off"}
                </button>
                <span className="text-[12px] text-scribe-3">Click on grasp and release</span>
              </div>
              {/* A key hint is not a control. Opening the controls used to need a
                  keyboard, on the one page most likely to be driven by a mouse
                  or a trackpad. */}
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex items-center gap-2 text-left"
              >
                <kbd className="min-w-[22px] border border-rule-strong bg-ink-3 px-1.5 py-0.5 text-center font-mono text-[12px] text-scribe-2">?</kbd>
                <span className="text-[12px] text-scribe-3 underline underline-offset-2 hover:text-scribe-2">All controls</span>
              </button>
            </dl>
          </Section>
          <Section title="Settlement">
            <p className="text-[13px] leading-relaxed text-scribe-2">
              One transaction records the trajectory hash, its task, your address
              and the verified score — and transfers the AVAX. There is no separate
              signing step.
            </p>
          </Section>
        </aside>

        <div className="relative order-1 h-[52dvh] lg:order-2 lg:h-auto lg:min-h-0">
          <StationViewport
            running={phase === "running"}
            goal={GOAL}
            start={START}
            payloadUrl={scene.payload.url}
            payloadWidthMm={scene.payload.widthMm}
            targetUrl={scene.target.url}
            targetWidthMm={scene.target.widthMm}
            runId={runId}
            onTelemetry={onTelemetry}
            onSample={onSample}
            environmentUrl={room.url}
            lighting={lightingFor(room.id)}
            ghosts={ghosts}
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
                ) : tel.overPayload ? (
                  <span className="text-signal">OVER THE PAYLOAD — PRESS Q TO LOWER</span>
                ) : (
                  <span className="text-scribe-3">
                    PAYLOAD <span className="text-scribe">{tel.payloadDist.toFixed(2)}</span> m
                    <span className="ml-2 text-scribe-3">— HOLD A</span>
                  </span>
                )
              ) : null}
              {tel.joints.clamped ? <span className="ml-auto text-reject">OUT OF REACH</span> : null}
            </div>
          ) : null}

          {helpOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Controls"
              className="absolute inset-0 z-20 flex items-center justify-center bg-ink-0/90 px-6"
              onClick={() => setHelpOpen(false)}
            >
              <div className="w-full max-w-sm border border-rule-strong bg-ink-1 px-5 py-4">
                <h2 className="font-display text-lg font-600">Controls</h2>
                <dl className="mt-4 flex flex-col gap-2">
                  <Key keys={["Drag"]} action="Move the tool in the workspace" />
                  <Key keys={["W", "S", "\u2191", "\u2193"]} action="Reach out / pull in" />
                  <Key keys={["A", "D", "\u2190", "\u2192"]} action="Swing left / right" />
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
              {recovered ? (
                <div className="mb-4 border border-signal bg-signal-dim px-4 py-3 text-left">
                  <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-signal">
                    An unsent run is waiting
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-scribe-2">
                    You measured {fmtScore(recovered.verdict.score)} on this task and left
                    before submitting. The samples are still here.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        samples.current = recovered.samples;
                        setVerdict(recovered.verdict);
                        setPhase("measured");
                        setRecovered(null);
                      }}
                      className="border border-scribe bg-scribe px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
                    >
                      Pick it back up
                    </button>
                    <button
                      type="button"
                      onClick={() => { clearDraft(); setRecovered(null); }}
                      className="border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3 transition-colors hover:text-scribe"
                    >
                      Discard it
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="max-w-sm text-center">
                <h2 className="font-display text-2xl font-600">Ready to record</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-scribe-2">
                  The timer starts on your first frame. Pick the payload up, bring
                  it to rest inside the datum circle, and let go — the measurement
                  is taken automatically once it settles.
                </p>
                {practice ? (
                  <div className="mt-4 border border-rule-strong bg-ink-2 px-3 py-2 text-left">
                    <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-2">
                      Practice run
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-scribe-3">
                      {!task.open
                        ? "This task has no slots left, so nothing here will be paid."
                        : "You have used all 5 of your runs on this task, so the chain will not pay another."}
                      {" "}
                      The scene, the controls and the measurement are exactly the
                      same &mdash; you just will not be asked to sign at the end.
                      No wallet needed.
                    </p>
                  </div>
                ) : null}
                <Button variant="primary" className="mt-6" onClick={start}>
                  {practice ? "Begin practice run" : "Begin run"}
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "measured" && verdict ? (
            <MeasurementSnap
              verdict={verdict}
              accepted={accepted}
              practice={practice}
              rewardMon={task.rewardMon}
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
              <Row label="Room" value={room.label} />
              <Row label="Skill" value={SKILL_LABEL[task.skill]} />
              <div className="flex items-center justify-between">
                <span className="label">Difficulty</span>
                <Difficulty level={task.difficulty} />
              </div>
              <Row label="Per run" value={`${fmtMon(task.rewardMon)} ${CURRENCY}`} tone="signal" />
              <Row label="Slots left" value={String(task.slotsTotal - task.slotsFilled)} />
              <Row label="Escrow" value={`${fmtMon(Number(task.escrowWei) / 1e18, 3)} ${CURRENCY}`} />
            </div>
          </Section>

          {tally && tally.measured > 0 ? (
            <Section title="This sitting">
              <div className="flex flex-col gap-3">
                <Row label="Runs measured" value={String(tally.measured)} />
                <Row label="Paid" value={String(tally.paid)} />
                <Row label="Mean score" value={fmtScore(Math.round(meanScore(tally)))} />
                <Row label="Earned" value={`${fmtMon(tally.earned, 4)} ${CURRENCY}`} tone="signal" />
                <Row label="At the bench" value={`${minutes(tally).toFixed(0)} min`} />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-scribe-3">
                This tab only. Every figure is also on chain independently &mdash; this
                just saves doing the arithmetic between runs.
              </p>
            </Section>
          ) : null}


          <Section title="In the room">
            {ghosts.length === 0 ? (
              <p className="text-[13px] text-scribe-3">
                Nobody else is working this task right now. Their tool shows in the
                scene when they are.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ghosts.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[13px] text-scribe-2">
                      {shortHash(g.id)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[12px] uppercase tracking-[0.12em]",
                        g.held ? "text-signal" : "text-scribe-3",
                      )}
                    >
                      {g.held ? "carrying" : "empty"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Live placement">
            {tel ? (
              <ToleranceBand deviationMm={tel.deviationMm} toleranceMm={TOLERANCE_MM} label="Deviation from datum" />
            ) : phase === "running" ? (
              // The reading arrives on the first frame the viewport renders.
              // Gating this on telemetry alone made the panel say the run had
              // not begun while the button beside it read END RUN — which is
              // what a throttled tab shows for as long as frames are held.
              <p className="text-[13px] text-scribe-3">Waiting for the first reading.</p>
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
  verdict, accepted, practice, rewardMon, session: s, tx, thinOnGas, onSubmit, onAgain, onLeave,
}: {
  verdict: Verdict;
  accepted: boolean;
  /** The chain will not pay this one, and said so before it started. */
  practice: boolean;
  /** This task's rate, so a lost point can be priced in AVAX. */
  rewardMon: number;
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
    : practice ? "Practice run — nothing to submit"
    : s.wrongNetwork ? "Switch to Avalanche Fuji"
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
          <div className="flex justify-center">
            <ScoreDial score={verdict.score} floor={ACCEPT_FLOOR} />
          </div>

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

          {/* A score is one number and an operator cannot act on it. This is the
              same arithmetic read backwards: what each term gave up, and what those
              points were worth on this task. */}
          <details className="border-t border-rule pt-3">
            <summary className="cursor-pointer list-none font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3 hover:text-scribe-2">
              Where the points went
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {shortfalls(verdict, rewardMon).map((s) => (
                <li key={s.key} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[13px] text-scribe">{s.label}</span>
                    <span className="font-mono text-[12px] tabular-nums text-scribe-3">
                      {s.lost > 0 ? `-${(s.lost / 100).toFixed(2)} pts` : "no loss"}
                      {s.costMon > 0 ? ` \u00b7 ${fmtMon(s.costMon, 4)} ${CURRENCY}` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] text-scribe-3">{s.reading}</span>
                  <span className="text-[13px] leading-relaxed text-scribe-2">{s.advice}</span>
                </li>
              ))}
            </ul>
            {belowFloorBy(verdict) !== null ? (
              <p className="mt-3 border-t border-rule pt-3 font-mono text-[12px] text-reject">
                {((belowFloorBy(verdict) ?? 0) / 100).toFixed(2)} points short of the 40.00 a run must reach to be paid.
              </p>
            ) : null}
          </details>


          {accepted ? (
            <div className="flex items-end justify-between border-t border-rule pt-4">
              <span className="label">{done ? "Paid to your wallet" : "Payable on submit"}</span>
              <span className="font-mono text-4xl font-medium leading-none tracking-[-0.02em] text-signal">
                {done ? <CountUp to={tx.paidMon ?? verdict.payoutMon} /> : fmtMon(verdict.payoutMon)}
                <span className="ml-1.5 text-[12px] text-scribe-3">{CURRENCY}</span>
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
                <span>gas <span className="text-scribe-2 tabular-nums">{(tx.gasMon ?? 0).toFixed(6)}</span> {CURRENCY}</span>
              </span>
            </div>
          ) : null}

          {thinOnGas && !done ? (
            <p className="border border-signal bg-signal-dim px-3 py-2 text-[13px] leading-relaxed text-signal">
              Your balance is {fmtMon(s.balance, 4)} {CURRENCY}. The chain reserves against
              the whole gas limit, so a submit needs roughly {RESERVE_FLOOR} {CURRENCY}
              on hand even though it spends a fraction of that.{" "}
              <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="underline">
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
              <Button variant="primary" className="flex-1" onClick={s.switchToChain}>{label}</Button>
            ) : !s.connected ? (
              <Button variant="primary" className="flex-1" onClick={s.connect}>{label}</Button>
            ) : (
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy || practice}
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

function Missing({ id, reason }: { id: string; reason: "id" | "chain" | "absent" }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="font-display text-3xl">
        {reason === "chain" ? "Could not read that task" : "No such task"}
      </h1>
      <p className="mt-2 text-scribe-2">
        {reason === "chain"
          ? `Task ${id} could not be read from the contract.`
          : reason === "absent"
            ? `Task ${id} is not in the registry. The contract has never been asked to create it.`
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
