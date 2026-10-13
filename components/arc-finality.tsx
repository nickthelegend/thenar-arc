"use client";

import { useEffect, useState } from "react";
import { HEARTBEAT_NAME, useArcHeartbeat, type Head, type Heartbeat } from "@/lib/arc-blocks";
import { LOCALNET, appChain } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { Details } from "@/components/details";

/**
 * Arc's finality, live: each new block as it lands, already final, with the
 * pace and the finality check measured in this browser (lib/arc-blocks.ts).
 *
 * There is no pipeline to draw. Arc's consensus is deterministic: a block is
 * final when it is produced, so every chip is final the moment it appears and
 * the node's `finalized` tag sits on the head. What is worth showing is that
 * this is measured, not claimed: the block interval comes from the chain's own
 * timestamps, and every poll checks the finalized tag against the head.
 */

const NETWORK = HEARTBEAT_NAME ?? appChain.name;

const ms = (v: number | null) => (v === null ? "…" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);

function status(b: Heartbeat) {
  if (b.connection === "live") return { dot: "bg-go", text: "live" };
  if (b.connection === "retrying") return { dot: "bg-reject", text: b.error ? `unreachable · ${b.error}` : "reconnecting" };
  if (b.connection === "connecting") return { dot: "bg-scribe-3", text: "connecting" };
  return { dot: "bg-scribe-3", text: "paused" };
}

/** A clock for "how long ago did this block land", ticking only while live. */
function useNow(on: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

function Chip({ h, fresh, className }: { h: Head; fresh: boolean; className?: string }) {
  return (
    <li
      className={cn(
        "min-w-0 flex-1 flex-col rounded-lg border border-go/40 bg-go-dim px-2 py-2 text-left font-mono text-go",
        "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        fresh ? "translate-y-0 opacity-100" : "opacity-90",
        className,
      )}
      title={`Block ${h.number.toLocaleString("en-US")} · final · ${h.txs} transaction${h.txs === 1 ? "" : "s"} · ${h.hash}`}
    >
      <span className="text-xs tabular-nums text-scribe-2">#{String(h.number).slice(-5)}</span>
      <span className="mt-1 flex items-center gap-1 truncate font-sans text-xs">
        Final <span aria-hidden>✓</span>
      </span>
      <span className="mt-1 whitespace-nowrap text-xs tabular-nums text-scribe-3">
        {h.txs} tx{h.txs === 1 ? "" : "s"}
      </span>
    </li>
  );
}

export function ArcFinality({ className }: { className?: string }) {
  const b = useArcHeartbeat();
  const now = useNow(b.connection === "live");
  const st = status(b);
  const head = b.heads[0] ?? null;
  const shown = b.heads.slice(0, 8);
  const sinceHead = head && now ? now - head.seenAt : null;

  return (
    <section
      aria-label={`${NETWORK}: blocks and finality, live`}
      data-testid="arc-finality"
      data-connection={b.connection}
      className={cn("w-full rounded-2xl border border-white/10 bg-ink-1 p-4 text-left sm:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-scribe">
          <span className={cn("inline-block size-2 rounded-full", st.dot, b.connection === "live" && "motion-safe:animate-pulse")} aria-hidden />
          {NETWORK} <span className="text-scribe-3">· {st.text}</span>
        </p>
        <p className="font-mono text-xs tabular-nums text-scribe-3">
          {head ? `block ${head.number.toLocaleString("en-US")}` : "waiting for a block"}
          {sinceHead !== null && sinceHead >= 0 ? ` · ${ms(sinceHead)} ago` : ""}
        </p>
      </div>

      <ol className="mt-4 flex gap-2" aria-live="off">
        {shown.length
          ? shown.map((h, i) => <Chip key={h.number} h={h} fresh={i === 0} className={i >= 4 ? "hidden sm:flex" : "flex"} />)
          : Array.from({ length: 8 }, (_, i) => (
              <li key={i} className={cn("h-[76px] flex-1 rounded-lg border border-rule bg-ink-2 motion-safe:animate-pulse", i >= 4 && "hidden sm:block")} />
            ))}
      </ol>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" data-testid="arc-latency">
        <Stat label="A block every" value={ms(b.intervalMs)} k="interval" />
        <Stat label="Finalized tag behind head" value={b.finalizedLag === null ? "…" : `${b.finalizedLag} block${b.finalizedLag === 1 ? "" : "s"}`} k="lag" />
        <Stat label="Final on inclusion" value={b.finalAtHead.of ? `${b.finalAtHead.yes} of ${b.finalAtHead.of} reads` : "…"} k="final" />
        <Stat label="Gas paid in" value="USDC" k="gas" />
      </dl>

      <Details className="mt-4">
        <p>
          Read live from {NETWORK}&rsquo;s public RPC. The interval is measured from the chain&rsquo;s own timestamps over the
          last {b.window || "few dozen"} blocks; each read also asks for the <span className="font-mono">finalized</span> block and
          compares it with the head. Arc&rsquo;s finality is deterministic: a block is final when it is made, so a run is paid
          and settled in the block that records it, with nothing to wait for after.
          {LOCALNET ? " This build's own transactions are on a local fork; this strip is the real network." : ""}
        </p>
      </Details>
    </section>
  );
}

function Stat({ label, value, k }: { label: string; value: string; k: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-scribe-3">{label}</dt>
      <dd className="font-mono text-base tabular-nums text-scribe" data-key={k}>{value}</dd>
    </div>
  );
}

/** One line for the station: Arc's heartbeat and its finality, measured. */
export function ArcHeartbeat({ className }: { className?: string }) {
  const b = useArcHeartbeat();
  const st = status(b);
  const shown = b.heads.slice(0, 6);
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="arc-heartbeat" data-connection={b.connection}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-scribe-2">
          <span className={cn("inline-block size-1.5 rounded-full", st.dot)} aria-hidden />
          {NETWORK}, live
        </span>
        <span className="font-mono text-xs tabular-nums text-scribe-3">
          {b.intervalMs !== null ? `final in ${ms(b.intervalMs)}` : "final on inclusion"}
        </span>
      </div>
      <ol className="flex gap-1" aria-label={`The last six ${NETWORK} blocks, each final when made`}>
        {(shown.length ? shown : Array.from({ length: 6 }, () => null)).map((h, i) => (
          <li
            key={h?.number ?? i}
            title={h ? `#${h.number} final · ${h.txs} txs` : undefined}
            className={cn("h-2 flex-1 rounded-sm transition-colors duration-300", h ? "bg-go" : "bg-ink-3")}
          />
        ))}
      </ol>
    </div>
  );
}
