"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { Difficulty, DimRule, SlotTally, StageTrack } from "@/components/primitives";
import { ActivityFeed } from "@/components/activity-feed";
import { useTasks, type ChainTask } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { SCENARIOS } from "@/lib/chain";
import { fmtInt, fmtMon, fmtSeconds } from "@/lib/format";

type SortKey = "reward" | "slots" | "difficulty" | "escrow";

const SORTS: [SortKey, string][] = [
  ["reward", "Reward"],
  ["slots", "Slots left"],
  ["difficulty", "Difficulty"],
  ["escrow", "Escrow"],
];

export default function HubPage() {
  const { data: tasks, isLoading, isError, error, refetch } = useTasks();
  const [scenario, setScenario] = useState<string>("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>("reward");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (tasks ?? []).filter(
      (t) =>
        (scenario === "all" || t.scenario === scenario) &&
        (!openOnly || t.open) &&
        (!needle || t.name.toLowerCase().includes(needle) || String(t.id) === needle),
    );
    const by: Record<SortKey, (a: ChainTask, b: ChainTask) => number> = {
      reward: (a, b) => b.rewardMon - a.rewardMon,
      slots: (a, b) => b.slotsTotal - b.slotsFilled - (a.slotsTotal - a.slotsFilled),
      difficulty: (a, b) => b.difficulty - a.difficulty,
      escrow: (a, b) => Number(b.escrowWei - a.escrowWei),
    };
    return [...list].sort(by[sort]);
  }, [tasks, scenario, openOnly, sort, q]);

  const openSlots = rows.reduce((n, t) => n + (t.slotsTotal - t.slotsFilled), 0);
  const escrow = rows.reduce((n, t) => n + Number(formatEther(t.escrowWei)), 0);
  const scenariosPresent = useMemo(
    () => SCENARIOS.filter((s) => (tasks ?? []).some((t) => t.scenario === s)),
    [tasks],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Open work</h1>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
          <Reading label="Tasks" value={isLoading ? "—" : fmtInt(rows.length)} />
          <Reading label="Unfilled slots" value={isLoading ? "—" : fmtInt(openSlots)} />
          <Reading label="Escrow at stake" value={isLoading ? "—" : fmtMon(escrow, 3)} unit="MON" tone="brass" />
          <Reading label="Cap per operator" value="5" unit="runs / task" />
          <span className="font-mono text-[12px] text-scribe-3 sm:ml-auto">
            Live from the contract on Monad Testnet
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <FilterRow label="Scenario">
          <Chip active={scenario === "all"} onClick={() => setScenario("all")}>All</Chip>
          {scenariosPresent.map((s) => (
            <Chip key={s} active={scenario === s} onClick={() => setScenario(s)}>{s}</Chip>
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
            {error instanceof Error ? error.message : "The Monad RPC did not answer."}
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
              className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-brass-hi hover:bg-brass-hi"
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
                      <Link href={`/task/${t.id}`} className="text-[14px] text-scribe hover:text-brass">
                        {t.name}
                      </Link>
                      <span className="font-mono text-[12px] capitalize text-scribe-3">{t.scenario}</span>
                    </div>
                  </Td>
                  <Td><Difficulty level={t.difficulty} /></Td>
                  <Td><StageTrack stage={t.policyMinted ? "post" : t.open ? "pre" : "training"} /></Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <SlotTally filled={t.slotsFilled} total={t.slotsTotal} />
                      <span className="font-mono text-[12px] tabular-nums text-scribe-2">
                        {fmtInt(t.slotsTotal - t.slotsFilled)} left
                        <span className="text-scribe-3"> / {fmtInt(t.slotsTotal)}</span>
                      </span>
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
                    <span className="font-mono text-[15px] font-medium tabular-nums text-brass">
                      {fmtMon(t.rewardMon)}
                      <span className="ml-1 text-[12px] text-scribe-3">MON</span>
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
                        Filled
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
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[12px] text-scribe-3">#{t.id}</span>
                    <Link href={`/task/${t.id}`} className="text-[15px] text-scribe">{t.name}</Link>
                    <span className="font-mono text-[12px] capitalize text-scribe-3">{t.scenario}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[16px] font-medium tabular-nums text-brass">
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
                  ) : null}
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

function Reading({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "brass" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] font-medium tabular-nums", tone === "brass" ? "text-brass" : "text-scribe")}>
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="label mt-[7px] w-[58px] shrink-0">{label}</span>
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
