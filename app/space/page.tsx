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
  const [presenceDown, setPresenceDown] = useState(false);
  const { tasks, answered, isError, refetch } = useTaskCatalogue();

  useEffect(() => {
    let live = true;
    const tick = () =>
      fetch("/api/space")
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((d: { rooms?: Room[] }) => { if (live) { setRooms(d.rooms ?? []); setPresenceDown(false); } })
        .catch(() => { if (live) setPresenceDown(true); });
    void tick();
    const id = setInterval(tick, 2000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const busy = new Map((rooms ?? []).map((r) => [r.taskId, r.operators]));
  // A room is a task that takes runs: slots left, not closed, not past its
  // deadline, no policy minted (the hub's "Accepting runs"). Counting every
  // unfilled slot listed eleven rooms when four would take a run. A room with
  // people in it is still worth watching whatever its state — hiding it meant
  // the floor could say two operators were here and show nowhere they were.
  const open = (tasks ?? [])
    .filter((t) => t.open || (busy.get(t.id) ?? 0) > 0)
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

      {presenceDown ? (
        <p role="status" className="mt-4 text-[13px] text-scribe-3">
          Who is in each room could not be read just now. The rooms below are still open; the counts come back on their own.
        </p>
      ) : null}

      {!answered && !isError ? (
        <p className="mt-6 text-[14px] text-scribe-3">Reading the tasks from the chain…</p>
      ) : isError && !answered ? (
        <div className="mt-6 border border-rule px-6 py-10 text-center">
          <p className="text-[15px] text-scribe-2">Could not read the task registry.</p>
          <button type="button" onClick={() => void refetch()} className="mt-4 border border-rule-strong px-4 py-2 text-[12px] text-scribe hover:border-scribe">
            Try again
          </button>
        </div>
      ) : open.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">No task is taking runs right now.</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-scribe-3">
            A room opens as soon as somebody funds a task with slots left to fill.
          </p>
          <Link
            href="/post"
            className="mt-5 inline-block border border-scribe bg-scribe px-4 py-2 text-[12px] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
          >
            Post a task
          </Link>
        </div>
      ) : (
        /* A ruled list, not a card grid.
           Two columns of bordered boxes is the shape this project's own design
           rules refuse — cards as page structure — and it read as one here:
           five rooms in a 2×3 arrangement with a hole in the corner, each
           repeating its own frame, and the eye given no column to run down. The
           hub already solved the same problem one route away, as a ruled table
           you can scan. A room is a row. */
        <ul className="mt-2">
          {open.map((t) => {
            const here = busy.get(t.id) ?? 0;
            const left = t.slotsTotal - t.slotsFilled;
            return (
              <li
                key={t.id}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-1 border-t border-rule py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_9rem_auto] sm:gap-x-7"
              >
                <span className="label">{t.id}</span>

                <span className="col-start-2 text-[15px] leading-snug text-scribe">{t.name}</span>

                <span className="col-start-2 row-start-2 font-mono text-[12px] tabular-nums text-scribe-3 sm:col-start-3 sm:row-start-1">
                  {left} {left === 1 ? "slot" : "slots"} left
                </span>

                <span className="col-start-2 row-start-2 justify-self-end font-mono text-[12px] tabular-nums text-signal sm:col-start-4 sm:row-start-1 sm:justify-self-start">
                  {fmtMon(t.rewardMon)} {CURRENCY}
                </span>

                {/* Occupancy is the one thing that changes while you look at
                    it, so it is the one thing that gets the accent and a shape:
                    a filled marker when somebody is in the room, a hairline
                    ring when it is empty. Colour alone would not survive a
                    monochrome print of this page. */}
                <span className="col-start-3 row-start-1 flex items-center gap-2 justify-self-end sm:col-start-5">
                  <span
                    aria-hidden
                    className={
                      here > 0
                        ? "size-1.5 shrink-0 bg-signal"
                        : "size-1.5 shrink-0 border border-rule-strong"
                    }
                  />
                  <span
                    className={
                      here > 0
                        ? "text-[12px] text-signal"
                        : "text-[12px] text-scribe-3"
                    }
                  >
                    {here > 0 ? `${here} here` : "empty"}
                  </span>
                  <Link
                    href={`/station/${t.id}`}
                    className="ml-3 border border-rule-strong px-3.5 py-1.5 text-[12px] text-scribe transition-colors hover:border-scribe"
                  >
                    {left === 0 ? "Watch" : here > 0 ? "Join" : "Open"}
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
