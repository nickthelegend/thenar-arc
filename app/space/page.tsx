"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { CURRENCY } from "@/lib/chain";
import { fmtMon } from "@/lib/format";
import { useTaskCatalogue } from "@/components/tasks-provider";

type Room = { taskId: number; operators: number };

export default function SpacePage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const { tasks } = useTaskCatalogue();

  useEffect(() => {
    let live = true;
    const tick = () =>
      fetch("/api/space")
        .then((r) => r.json())
        .then((d: { rooms?: Room[] }) => { if (live) setRooms(d.rooms ?? []); })
        .catch(() => { if (live) setRooms([]); });
    void tick();
    const id = setInterval(tick, 2000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const busy = new Map((rooms ?? []).map((r) => [r.taskId, r.operators]));
  // A task with no slots left is not worth walking into, but a room with people
  // in it is worth watching whether or not it can still be filled — hiding it
  // meant the floor could say two operators were here and show nowhere they were.
  const open = (tasks ?? [])
    .filter((t) => t.slotsTotal - t.slotsFilled > 0 || (busy.get(t.id) ?? 0) > 0)
    .sort((a, b) => (busy.get(b.id) ?? 0) - (busy.get(a.id) ?? 0));
  const total = (rooms ?? []).reduce((n, r) => n + r.operators, 0);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">The floor</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        Every open task is a room. Walk into one and you drive your own arm through
        your own run, but you can see where everyone else&rsquo;s tool is while you do
        it &mdash; and they can see yours. Watching costs nothing and needs no wallet;
        the run you record and the payment you earn are yours alone either way.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Rooms open</span>
          <span className="font-mono text-[15px] tabular-nums">{open.length}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">On the floor</span>
          <span className="font-mono text-[15px] tabular-nums text-signal">{total}</span>
        </span>
      </div>

      <DimRule className="mt-6" />

      {open.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">Every task is full.</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-scribe-3">
            A room opens as soon as somebody funds a task with slots left to fill.
          </p>
          <Link
            href="/post"
            className="mt-5 inline-block border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
          >
            Post a task
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {open.map((t) => {
            const here = busy.get(t.id) ?? 0;
            return (
              <li key={t.id} className="border border-rule p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label">Task {t.id}</span>
                  <span
                    className={
                      here > 0
                        ? "font-mono text-[12px] uppercase tracking-[0.12em] text-signal"
                        : "font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3"
                    }
                  >
                    {here > 0 ? `${here} here now` : "empty"}
                  </span>
                </div>
                <p className="mt-2 text-[15px] leading-snug text-scribe">{t.name}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[12px] tabular-nums text-scribe-3">
                  <span>{t.slotsTotal - t.slotsFilled} slots left</span>
                  <span className="text-signal">{fmtMon(t.rewardMon)} {CURRENCY} per run</span>
                </div>
                <Link
                  href={`/station/${t.id}`}
                  className="mt-4 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
                >
                  {t.slotsTotal - t.slotsFilled === 0
                    ? "Watch"
                    : here > 0
                      ? "Join them"
                      : "Open the room"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
