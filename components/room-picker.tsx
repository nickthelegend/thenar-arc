"use client";

import { PropPreview } from "@/components/prop-picker";
import { cn } from "@/lib/cn";
import { SCENARIOS } from "@/lib/chain";
import { environmentForScenario } from "@/lib/environments";

/**
 * Choose the room a task happens in.
 *
 * The choice is the scenario index, which is a uint8 on the contract — so
 * picking a room here is writing it to the chain, and there is no off-chain
 * table that could disagree with what the station later draws. Each tile
 * renders the same GLB the station loads, so a funder escrows against the room
 * they actually looked at.
 */
export function RoomPicker({
  value, onChange,
}: {
  value: number;
  onChange: (scenarioIndex: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {SCENARIOS.map((sc, i) => {
        const room = environmentForScenario(sc);
        const on = value === i;
        return (
          <button
            key={sc}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(i)}
            title={room.blurb}
            className={cn(
              "flex flex-col overflow-hidden border text-left transition-colors",
              on ? "border-signal bg-signal-dim" : "border-rule bg-ink-2 hover:border-rule-strong",
            )}
          >
            <PropPreview url={room.url} className="h-[74px] w-full" />
            <span
              className={cn(
                "block truncate border-t px-2 py-1 font-mono text-[12px] leading-tight",
                on ? "border-signal/40 text-signal-hi" : "border-rule text-scribe-3",
              )}
            >
              {room.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
