"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Difficulty, DimRule, SlotTally, StageTrack } from "@/components/primitives";
import { useTask } from "@/lib/hooks";
import { txUrl, addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtMon, fmtScore, fmtSeconds, shortHash } from "@/lib/format";

type Row = {
  traj_hash: string; contributor: string; score: number;
  deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
};

export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const n = Number(id);
  const { data: task, isLoading, isError } = useTask(Number.isInteger(n) ? n : undefined);

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

  if (isLoading || !task) {
    return <div className="mx-auto max-w-[900px] px-5 py-16"><span className="label">Reading task #{n}…</span></div>;
  }

  const dist = bucket(runs ?? []);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <span className="font-mono text-[12px] text-scribe-3">Task #{task.id}</span>
      <h1 className="mt-1 font-display text-4xl font-600 leading-[1.02] tracking-[-0.01em]">{task.name}</h1>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Difficulty level={task.difficulty} />
        <StageTrack stage={task.policyMinted ? "post" : task.open ? "pre" : "training"} />
        <span className="font-mono text-[12px] capitalize text-scribe-3">{task.scenario}</span>
        <a href={addressUrl(task.funder)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-scribe-3 hover:text-probe">
          funded by {shortHash(task.funder)}
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Per run" value={`${fmtMon(task.rewardMon)} MON`} tone="signal" />
        <Cell label="Escrow left" value={`${fmtMon(Number(formatEther(task.escrowWei)), 3)} MON`} />
        <Cell label="Par" value={fmtSeconds(task.parSeconds)} />
        <Cell label="Slots" value={`${task.slotsFilled} / ${task.slotsTotal}`} />
      </div>

      <div className="mt-4"><SlotTally filled={task.slotsFilled} total={task.slotsTotal} /></div>

      {task.open ? (
        <Link
          href={`/station/${task.id}`}
          className="mt-6 inline-block border border-scribe bg-scribe px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Run this task
        </Link>
      ) : (
        <p className="mt-6 border border-rule px-4 py-3 text-[14px] text-scribe-2">
          Every slot is filled. {task.policyMinted ? "Its policy has been minted." : "It is ready for its policy to be minted in the Foundry."}
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

          <ul className="mt-6 flex flex-col">
            {runs!.map((r) => (
              <li key={r.traj_hash} className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule py-2.5 font-mono text-[12px]">
                <a href={addressUrl(r.contributor)} target="_blank" rel="noreferrer" className="text-scribe-2 hover:text-probe">
                  {shortHash(r.contributor)}
                </a>
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
