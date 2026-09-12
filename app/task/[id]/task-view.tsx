"use client";

import Link from "next/link";
import { Attempts } from "@/components/attempts";
import { Coverage } from "@/components/coverage";
import { Filling } from "@/components/filling";
import { TaskTeam } from "@/components/task-team";
import { TaskNotes } from "@/components/task-notes";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Difficulty, DimRule, SlotTally, StageTrack } from "@/components/primitives";
import { DatumScale } from "@/components/datum-scale";
import { SKILL_LABEL } from "@/lib/skills";
import { taskStats } from "@/lib/task-stats";
import { PathOverlay } from "@/components/path-overlay";
import { FunderHistory } from "@/components/funder-history";
import { TaskEscrow } from "@/components/task-escrow";
import { txUrl, addressUrl, CURRENCY, isSeedFunded } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtMon, fmtScore, fmtSeconds, shortHash } from "@/lib/format";
import { useTaskCatalogue, useCatalogueTask } from "@/components/tasks-provider";

type Row = {
  traj_hash: string; contributor: string; score: number;
  deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
};

export default function TaskView() {
  const { id } = useParams<{ id: string }>();
  const n = Number(id);
  const { isLoading, isError } = useTaskCatalogue();
  const task = useCatalogueTask(Number.isInteger(n) ? n : undefined);

  const { data: runs } = useQuery({
    queryKey: ["taskRuns", n],
    enabled: Number.isInteger(n),
    refetchInterval: 10_000,
    queryFn: async (): Promise<Row[]> => {
      const r = await fetch(`/api/task/${n}/runs`);
      if (!r.ok) throw new Error("could not load submissions");
      return (await r.json()).runs;
    },
  });

  if (isError || !Number.isInteger(n)) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">No such task</h1>
        <p className="mt-2 text-scribe-2">Task {id} is not in the registry.</p>
        <Link href="/hub" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the hub
        </Link>
      </div>
    );
  }

  // One guard, so the narrowing below is obvious rather than inferred through
  // three booleans: past here the task exists.
  if (!task) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-16">
        <span className="label">{isLoading ? `Reading task #${n}…` : `Task #${n} is not in the registry.`}</span>
      </div>
    );
  }

  const dist = bucket(runs ?? []);
  // What the runs say about the task, as against what the funder guessed.
  const stats = taskStats(runs ?? [], task.slotsTotal, task.slotsFilled);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <span className="font-mono text-[12px] text-scribe-3">Task #{task.id}</span>
      <h1 className="mt-1 font-display text-4xl font-600 leading-[1.02] tracking-[-0.01em]">{task.name}</h1>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Difficulty level={task.difficulty} />
        <StageTrack stage={task.policyMinted ? "post" : task.open ? "pre" : "training"} />
        <span className="font-mono text-[12px] capitalize text-scribe-3">{task.scenario}</span>
        <span className="border border-rule px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-2">
          {SKILL_LABEL[task.skill]}
        </span>
        <span className="font-mono text-[12px] text-scribe-3">{task.scene.room.label}</span>
        <a href={addressUrl(task.funder)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-scribe-3 hover:text-probe">
          funded by {shortHash(task.funder)}
          {isSeedFunded(task.funder) ? " \u00b7 posted by us to demonstrate the loop" : ""}
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Per run" value={`${fmtMon(task.rewardMon)} ${CURRENCY}`} tone="signal" />
        <Cell label="Escrow left" value={`${fmtMon(Number(formatEther(task.escrowWei)), 3)} ${CURRENCY}`} />
        <Cell label="Par" value={fmtSeconds(task.parSeconds)} />
        <Cell label="Slots" value={`${task.slotsFilled} / ${task.slotsTotal}`} />
      </div>

      <div className="mt-4"><SlotTally filled={task.slotsFilled} total={task.slotsTotal} /></div>

      {/* How hard this actually is, at the size it actually is. Every surface
          states the band in millimetres and a number in millimetres tells
          nobody whether 25 mm is generous or unforgiving. */}
      <DatumScale
        className="mt-6"
        payloadMm={task.scene.payloads[0]?.widthMm ?? 56}
        payloadLabel={task.scene.payloads[0]?.label ?? "payload"}
        seats={task.scene.payloads.length}
      />

      <TaskEscrow task={task} />

      {task.open ? (
        <Link
          href={`/station/${task.id}`}
          className="mt-6 inline-block border border-scribe bg-scribe px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Run this task
        </Link>
      ) : (
        <p className="mt-6 border border-rule px-4 py-3 text-[14px] text-scribe-2">
          {task.closed
            ? "Closed by its funder after the deadline. It takes no more runs."
            : task.expired
              ? "Past its deadline. It takes no more runs, whether or not its funder has closed it."
              : task.policyMinted
                ? "Every slot is filled. Its policy has been minted."
                : "Every slot is filled. It is ready for its policy to be minted in the Foundry."}
        </p>
      )}

      <DimRule className="mt-10" note={`Submissions — ${runs?.length ?? 0}`} />

      {(runs?.length ?? 0) === 0 ? (
        <p className="mt-4 max-w-[58ch] text-[14px] text-scribe-3">
          No run has been recorded against this task yet. The first accepted one
          appears here with its measurement and the transaction that paid it.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-1" role="img" aria-label="Score distribution">
            {dist.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[12px] tabular-nums text-scribe-3">{d.n || ""}</span>
                <div className="w-full bg-ink-3" style={{ height: `${8 + d.h * 56}px` }}>
                  <div className="h-full w-full bg-signal" style={{ opacity: d.n ? 1 : 0.12 }} />
                </div>
                <span className="font-mono text-[12px] text-scribe-3">{d.label}</span>
              </div>
            ))}
          </div>

          {stats.runs > 0 ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule pt-3">
              <span className="flex items-baseline gap-2">
                <span className="label">Mean score</span>
                <span className="font-mono text-[15px] tabular-nums text-scribe">{(stats.meanScore / 100).toFixed(2)}</span>
              </span>
              {stats.observed !== null ? (
                <span className="flex items-baseline gap-2">
                  <span className="label">Observed difficulty</span>
                  <span className="font-mono text-[15px] tabular-nums text-scribe-2">
                    {stats.observed} / 5
                    {stats.observed !== task.difficulty ? (
                      <span className="ml-2 text-[12px] text-scribe-3">funder said {task.difficulty}</span>
                    ) : null}
                  </span>
                </span>
              ) : null}
              {stats.perHour !== null ? (
                <span className="flex items-baseline gap-2">
                  <span className="label">Filling at</span>
                  <span className="font-mono text-[15px] tabular-nums text-scribe-2">
                    {stats.perHour.toFixed(1)} <span className="text-[12px] text-scribe-3">runs / hour</span>
                  </span>
                </span>
              ) : null}
              {stats.fillsIn !== null ? (
                <span className="flex items-baseline gap-2">
                  <span className="label">Full in</span>
                  <span className="font-mono text-[15px] tabular-nums text-signal">
                    {stats.fillsIn < 3_600_000
                      ? `${Math.round(stats.fillsIn / 60_000)} min`
                      : `${(stats.fillsIn / 3_600_000).toFixed(1)} h`}
                  </span>
                </span>
              ) : null}
              <span className="max-w-[52ch] text-[13px] leading-relaxed text-scribe-3">
                From this task&rsquo;s own runs on chain. The attempts below add the
                ones that were scored and not paid, which is where a pass rate
                comes from.
              </span>
            </div>
          ) : null}

          <Attempts taskId={n} />
          <Coverage taskId={n} />
          <Filling taskId={n} />

          {stats.runs > 0 ? (
            <>
              <DimRule className="mt-10" note="How everyone did it" />
              <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
                The distribution says how well people scored. This says how they got
                there &mdash; whether the good runs share a route, and whether the poor
                ones wander. Best run brightest; hover a row to lift its path out.
              </p>
              <PathOverlay taskId={task.id} goal={[0.16, -0.18]} />
            </>
          ) : null}

          <FunderHistory taskId={task.id} funder={task.funder} />

          <TaskTeam taskId={task.id} />

          <TaskNotes taskId={task.id} />


          <ul className="mt-6 flex flex-col">
            {runs!.map((r) => (
              <li key={r.traj_hash} className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule py-2.5 font-mono text-[12px]">
                {/* Internal, because the operator page shows this address's
                    whole history — runs from the ledger and every call from
                    Avalanche's index, including the reverted ones. */}
                <Link href={`/operator/${r.contributor}`} className="text-scribe-2 hover:text-probe">
                  {shortHash(r.contributor)}
                </Link>
                <span className="text-scribe">{fmtScore(r.score)}</span>
                <span className="text-scribe-3">{r.deviation_mm.toFixed(1)} mm</span>
                <span className="text-scribe-3">{fmtSeconds(r.duration_s)}</span>
                <Link href={`/run/${r.traj_hash}`} className="ml-auto text-probe hover:underline">verify →</Link>
                {r.tx_hash ? (
                  <a href={txUrl(r.tx_hash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                    {shortHash(r.tx_hash)}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function bucket(runs: Row[]) {
  const edges = [4000, 5000, 6000, 7000, 8000, 9000, 10001];
  const labels = ["40", "50", "60", "70", "80", "90"];
  const counts = labels.map(() => 0);
  for (const r of runs) {
    for (let i = 0; i < labels.length; i += 1) {
      if (r.score >= edges[i] && r.score < edges[i + 1]) { counts[i] += 1; break; }
    }
  }
  const max = Math.max(1, ...counts);
  return labels.map((label, i) => ({ label, n: counts[i], h: counts[i] / max }));
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-4 py-3">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] tabular-nums", tone === "signal" ? "text-signal" : "text-scribe")}>{value}</span>
    </div>
  );
}
