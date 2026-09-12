"use client";

import Link from "next/link";
import { payloadLabel } from "@/lib/props";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { Difficulty, DimRule, SlotTally, StageTrack } from "@/components/primitives";
import { ActivityFeed } from "@/components/activity-feed";
import { Sitting } from "@/components/sitting";
import { useMeasured, contradiction, type Measured } from "@/lib/measured";
import { fmtPercent } from "@/lib/format";
import { PropPreview } from "@/components/prop-picker";
import { cn } from "@/lib/cn";
import { SCENARIOS, CURRENCY, isSeedFunded } from "@/lib/chain";
import { fmtInt, fmtMon, fmtSeconds } from "@/lib/format";
import { useTaskCatalogue, type TaskWithScene } from "@/components/tasks-provider";
import { SKILLS, SKILL_LABEL } from "@/lib/skills";

type SortKey = "reward" | "slots" | "difficulty" | "escrow";

const SORTS: [SortKey, string][] = [
  ["reward", "Reward"],
  ["slots", "Slots left"],
  ["difficulty", "Difficulty"],
  ["escrow", "Escrow"],
];

export default function HubPage() {
  const { tasks, isLoading, isError, error, refetch } = useTaskCatalogue();
  const [scenario, setScenario] = useState<string>("all");
  const [skill, setSkill] = useState<string>("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("reward");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (tasks ?? []).filter(
      (t) =>
        (scenario === "all" || t.scenario === scenario) &&
          (skill === "all" || t.skill === skill) &&
        (!openOnly || t.open) &&
        (!needle || t.name.toLowerCase().includes(needle) || String(t.id) === needle),
    );
    const by: Record<SortKey, (a: TaskWithScene, b: TaskWithScene) => number> = {
      reward: (a, b) => b.rewardMon - a.rewardMon,
      slots: (a, b) => b.slotsTotal - b.slotsFilled - (a.slotsTotal - a.slotsFilled),
      difficulty: (a, b) => b.difficulty - a.difficulty,
      escrow: (a, b) => Number(b.escrowWei - a.escrowWei),
    };
    return [...list].sort(by[sort]);
  }, [tasks, scenario, skill, openOnly, sort, q]);

  // Thenar has no third-party funders yet. Counted rather than asserted: the
  // product's own rule is that anything shown before real traffic exists is
  // labelled, not left to look like organic demand.
  const seeded = (tasks ?? []).filter((t) => isSeedFunded(t.funder)).length;
  const totalTasks = (tasks ?? []).length;

  // Over every task, not over the filtered rows.
  //
  // This strip sits above the filter chips, says "Live from the contract" and
  // is read as a description of the board. Computed from `rows` it silently
  // tracked whatever filter happened to be on — so the default view showed
  // "Tasks 5" directly above a sentence reading "All 6 were posted from the
  // address that deployed the protocol". Two numbers for the same quantity, a
  // paragraph apart, and the chain says 6. The filtered count is not lost:
  // the table below is the filtered view.
  const allTasks = tasks ?? [];
  /**
   * Slots a run driven now could actually fill.
   *
   * This counted every unfilled slot on every task, including four on a task
   * whose funder has already closed it and taken the escrow back. They cannot
   * be filled by anybody, ever, and the figure sits under a heading that reads
   * as available work.
   */
  const openSlots = allTasks
    .filter((t) => t.open)
    .reduce((n, t) => n + (t.slotsTotal - t.slotsFilled), 0);
  const escrow = allTasks.reduce((n, t) => n + Number(formatEther(t.escrowWei)), 0);
  const scenariosPresent = useMemo(
    () => SCENARIOS.filter((s) => (tasks ?? []).some((t) => t.scenario === s)),
    [tasks],
  );

  // Only the skills tasks actually ask for: a chip for a skill nobody has
  // posted filters to an empty hub and reads as a dead control.
  const skillsPresent = useMemo(
    () => SKILLS.filter((k) => (tasks ?? []).some((t) => t.skill === k)),
    [tasks],
  );

  /**
   * What the record says about each task, against what its funder declared.
   *
   * Difficulty is a claim somebody typed when they posted. Every other claim on
   * this site is checked against the ledger; this one never was.
   */
  const measured = useMeasured();
  const clash = measured ? contradiction(tasks ?? [], measured) : null;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Open work</h1>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
          <Reading label="Tasks" value={isLoading ? "—" : fmtInt(totalTasks)} />
          <Reading label="Unfilled slots" value={isLoading ? "—" : fmtInt(openSlots)} />
          <Reading label="Escrow at stake" value={isLoading ? "—" : fmtMon(escrow, 3)} unit={CURRENCY} tone="signal" />
          <Reading label="Cap per operator" value="5" unit="runs / task" />
          <span className="font-mono text-[12px] text-scribe-3 sm:ml-auto">
            Live from the contract on Avalanche Fuji
          </span>
        </div>

        {clash ? (
          <p className="max-w-[76ch] text-[13px] leading-relaxed text-scribe-3">
            <span className="text-scribe-2">Declared difficulty is not predicting anything.</span>{" "}
            Task #{clash.easier} is declared easier than #{clash.harder} and has paid{" "}
            {fmtPercent(clash.easierRate, 0)} of the {clash.easierN} runs submitted to it,
            against {fmtPercent(clash.harderRate, 0)} of {clash.harderN} on the harder one.
            Those are small numbers and are shown as counts for that reason &mdash; but the
            figure beside each difficulty below is what happened, and the bars are what
            somebody typed.
          </p>
        ) : null}

        {/* What the operator just came out of. They leave the station to pick
            the next task, and the tally that answers "how did that stretch go"
            was thrown away at exactly that moment. */}
        <Sitting />

        {totalTasks > 0 && seeded === totalTasks ? (
          <p className="max-w-[76ch] text-[13px] leading-relaxed text-scribe-3">
            <span className="text-scribe-2">Every task here was funded by us.</span>{" "}
            All {totalTasks} were posted from the address that deployed the protocol,
            to demonstrate the loop end to end. The escrow, the payouts and the
            trajectories are real and on chain; the demand is not. No third party has
            funded a task yet.
          </p>
        ) : seeded > 0 ? (
          <p className="max-w-[76ch] text-[13px] leading-relaxed text-scribe-3">
            {seeded} of {totalTasks} tasks were funded by the address that deployed
            the protocol, to demonstrate the loop.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <FilterRow label="Scenario">
          <Chip active={scenario === "all"} onClick={() => setScenario("all")}>All</Chip>
          {scenariosPresent.map((s) => (
            <Chip key={s} active={scenario === s} onClick={() => setScenario(s)}>{s}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="Skill">
          <Chip active={skill === "all"} onClick={() => setSkill("all")}>All</Chip>
          {skillsPresent.map((k) => (
            <Chip key={k} active={skill === k} onClick={() => setSkill(k)}>{SKILL_LABEL[k]}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="View">
          <Chip active={openOnly} onClick={() => setOpenOnly(true)}>Accepting runs</Chip>
          <Chip active={!openOnly} onClick={() => setOpenOnly(false)}>Every task</Chip>
          <span className="mx-1 w-px shrink-0 self-stretch bg-rule" />
          {SORTS.map(([k, l]) => (
            <Chip key={k} active={sort === k} onClick={() => setSort(k)}>{l}</Chip>
          ))}
        </FilterRow>

        <FilterRow label="Find">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search instructions, or a task id"
            aria-label="Search tasks"
            className="min-w-0 flex-1 border border-rule bg-ink-2 px-2.5 py-1 font-mono text-[12px] text-scribe placeholder:text-scribe-3 focus:border-rule-strong focus:outline-none"
          />
        </FilterRow>
      </div>

      <DimRule className="mt-6" />

      {isError ? (
        <div className="mt-6 border border-reject bg-reject-dim px-6 py-10 text-center">
          <p className="text-[15px] text-reject">Could not read the task registry.</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[14px] text-scribe-2">
            {error instanceof Error ? error.message : "The Avalanche RPC did not answer."}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-5 border border-reject px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-reject transition-colors hover:bg-reject hover:text-ink-0"
          >
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <ul className="mt-6 flex flex-col" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-6 border-b border-rule py-4">
              <span className="hatch h-3 w-[68px]" />
              <span className="hatch h-3 flex-1" />
              <span className="hatch h-3 w-[120px]" />
              <span className="hatch h-3 w-[80px]" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">
            {(tasks ?? []).length === 0
              ? "The registry has no tasks yet."
              : "No task matches that combination."}
          </p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[14px] text-scribe-3">
            {(tasks ?? []).length === 0
              ? "Post the first bounty and fund it — anyone can open work here."
              : "Clear the scenario filter or widen the view to see the rest."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => { setScenario("all"); setOpenOnly(false); setQ(""); }}
              className="border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
            >
              Clear filters
            </button>
            <Link
              href="/post"
              className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
            >
              Post a task
            </Link>
          </div>
        </div>
      ) : (
        <>
          <table className="mt-6 hidden w-full border-collapse lg:table">
            <thead>
              <tr className="border-b border-rule-strong">
                <Th className="w-[64px]">Task</Th>
                <Th>Instruction</Th>
                <Th className="w-[92px]">Difficulty</Th>
                <Th className="w-[150px]">Stage</Th>
                <Th className="w-[184px]">Slots</Th>
                <Th className="w-[92px]" align="right">Par</Th>
                <Th className="w-[112px]" align="right">Escrow</Th>
                <Th className="w-[124px]" align="right">Per run</Th>
                <Th className="w-[86px]" align="right">Open</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="group border-b border-rule transition-colors hover:bg-ink-2">
                  <Td><span className="font-mono text-[12px] text-scribe-3">#{t.id}</span></Td>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/task/${t.id}`} className="text-[14px] text-scribe hover:text-signal">
                        {t.name}
                      </Link>
                      <span className="font-mono text-[12px] text-scribe-3">
                      <span className="capitalize">{t.scenario}</span>
                      <span className="mx-1.5 text-rule-strong">/</span>
                      {payloadLabel(t.scene, t.scenario)}
                      <span className="mx-1.5 text-rule-strong">&rarr;</span>
                      {t.scene.target.label}
                    </span>
                    </div>
                  </Td>
                  <Td>
                    <Difficulty level={t.difficulty} />
                    <MeasuredNote m={measured?.get(t.id)} loaded={Boolean(measured)} />
                  </Td>
                  <Td><StageTrack stage={t.policyMinted ? "post" : t.open ? "pre" : "training"} /></Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <SlotTally filled={t.slotsFilled} total={t.slotsTotal} />
                      <span className="font-mono text-[12px] tabular-nums text-scribe-2">
                        {fmtInt(t.slotsTotal - t.slotsFilled)} left
                        <span className="text-scribe-3"> / {fmtInt(t.slotsTotal)}</span>
                      </span>
                      {/* A deadline is a property of the offer, not a detail:
                          after it the funder may take the escrow back, and a
                          run driven the day after pays nothing. */}
                      {t.expiresAt !== null ? (
                        <span className={cn(
                          "font-mono text-[11px] tabular-nums",
                          t.closed || t.expired ? "text-reject" : "text-scribe-3",
                        )}>
                          {t.closed
                            ? "escrow returned to the funder"
                            : t.expired
                              ? "deadline passed"
                              : `until ${new Date(t.expiresAt).toLocaleDateString()}`}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[13px] tabular-nums text-scribe-2">
                      {fmtSeconds(t.parSeconds)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[13px] tabular-nums text-scribe-2">
                      {fmtMon(Number(formatEther(t.escrowWei)), 3)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-[15px] font-medium tabular-nums text-signal">
                        {fmtMon(t.rewardMon)}
                        <span className="ml-1 text-[12px] text-scribe-3">{CURRENCY}</span>
                      </span>
                      {/* Per run is not comparable across tasks that take
                          different lengths of time. Par is the task's own
                          estimate of that, so this is the rate an operator is
                          actually choosing between. */}
                      <span className="font-mono text-[11px] tabular-nums text-scribe-3">
                        {fmtMon((t.rewardMon * 60) / Math.max(1, t.parSeconds), 4)} / min
                      </span>
                    </span>
                  </Td>
                  <Td align="right">
                    {t.open ? (
                      <Link
                        href={`/station/${t.id}`}
                        className="inline-flex border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors group-hover:border-scribe group-hover:bg-scribe group-hover:text-ink-0"
                      >
                        Run
                      </Link>
                    ) : (
                      <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">
                        {closedBecause(t)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-6 flex flex-col lg:hidden">
            {rows.map((t) => (
              <li key={t.id} className="border-b border-rule py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-scribe-3">#{t.id}</span>
                      {/* The objects themselves, from the same GLBs the station
                          loads — a task should look like what it is before you
                          open it. Drawn only when the row is on screen. */}
                      {t.scene.payloads.map((p) => (
                        <PropPreview key={p.id} url={p.url} className="h-8 w-8 shrink-0" />
                      ))}
                      <PropPreview url={t.scene.target.url} className="h-8 w-8 shrink-0" />
                    </span>
                    <Link href={`/task/${t.id}`} className="text-[15px] text-scribe">{t.name}</Link>
                      <span className="mt-0.5 block font-mono text-[12px] text-scribe-3">
                        {payloadLabel(t.scene, t.scenario)}
                        <span className="mx-1.5 text-rule-strong">&rarr;</span>
                        {t.scene.target.label}
                        <span className="mx-1.5 text-rule-strong">/</span>
                        {t.scene.room.label}
                      </span>
                    <span className="font-mono text-[12px] capitalize text-scribe-3">{t.scenario}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[16px] font-medium tabular-nums text-signal">
                    {fmtMon(t.rewardMon)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <Difficulty level={t.difficulty} />
                  <StageTrack stage={t.policyMinted ? "post" : t.open ? "pre" : "training"} />
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex-1"><SlotTally filled={t.slotsFilled} total={t.slotsTotal} /></div>
                  <span className="font-mono text-[12px] tabular-nums text-scribe-2">
                    {fmtInt(t.slotsTotal - t.slotsFilled)} left
                  </span>
                  {t.open ? (
                    <Link
                      href={`/station/${t.id}`}
                      className="border border-scribe bg-scribe px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0"
                    >
                      Run
                    </Link>
                  ) : (
                    <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">
                      {closedBecause(t)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-12">
        <ActivityFeed />
      </div>
    </div>
  );
}

function Reading({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "signal" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] font-medium tabular-nums", tone === "signal" ? "text-signal" : "text-scribe")}>
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {/* Wide enough for "Scenario", which is the longest of the four and
          measured 71px against the 58px this column used to be. The chips that
          follow it are opaque and come later in the flex order, so the excess
          was not clipped or wrapped — it was painted over, and the row read
          "SCENARI" on a phone. The other three labels fit either width. */}
      <span className="label mt-[7px] w-[72px] shrink-0">{label}</span>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap border px-2.5 py-1 font-mono text-[12px] capitalize tracking-[0.06em] transition-colors",
        active ? "border-scribe bg-scribe text-ink-0" : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe-2",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, className, align = "left" }: { children: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return <th scope="col" className={cn("label pb-2 font-normal", align === "right" ? "text-right" : "text-left", className)}>{children}</th>;
}

function Td({ children, className, align = "left" }: { children: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <td className={cn("py-3 pr-4 align-middle", align === "right" && "text-right", className)}>
      {align === "right" ? <div className="flex justify-end">{children}</div> : children}
    </td>
  );
}

/**
 * What the record says, under the difficulty somebody declared.
 *
 * Counts rather than only a rate: "0 of 2" and "0 of 200" are the same rate and
 * are not the same statement, and at these sample sizes the count is most of
 * the information. A task nobody has submitted a run on says so rather than
 * showing a zero, because a rate over no attempts is unknown, not zero.
 */
function MeasuredNote({ m, loaded }: { m: Measured | undefined; loaded: boolean }) {
  if (!loaded) return null;
  // A task with no episodes at all has no row in the corpus, which is a
  // different thing from an empty one — and both mean "nobody has driven it".
  const submitted = m ? m.paid + m.failed : 0;
  if (!m) {
    return (
      <span className="mt-1 block font-mono text-[11px] text-scribe-3">no runs yet</span>
    );
  }
  return (
    <span className="mt-1 block font-mono text-[11px] tabular-nums text-scribe-3">
      {submitted === 0
        ? m.unsubmitted > 0
          ? `${m.unsubmitted} never sent`
          : "no runs yet"
        : `${m.paid}/${submitted} paid`}
    </span>
  );
}

/**
 * Why a task cannot be run, in the order the reasons actually bite.
 *
 * "Filled" was the only answer the hub had, and it was wrong for three of the
 * four ways a task stops taking runs. A closed one has had its escrow taken
 * back by its funder; an expired one will be; a minted one has become a policy.
 * An operator who drives any of them has done the work before the contract
 * refuses to pay, which is the one outcome this interface exists to prevent.
 */
function closedBecause(t: TaskWithScene): string {
  if (t.closed) return "Escrow returned";
  if (t.expired) return "Expired";
  if (t.policyMinted) return "Minted";
  return "Filled";
}
