"use client";

import { useEffect, useState } from "react";
import { cadence, median, type Block, type CommitState } from "@/lib/monad-commit";
import { useMonadStream, WATCHED, type Connection } from "@/lib/monad-stream";
import { LOCALNET } from "@/lib/chain";
import { cn } from "@/lib/cn";

/**
 * Monad's consensus pipeline, live: each block as it is proposed, voted on,
 * finalized and verified, with the milliseconds this browser measured.
 *
 * It reads Monad testnet itself, over the public WebSocket, on every build. On
 * a local build the strip is the real network beside a local chain, and it
 * says so rather than letting the two blur.
 */

const TONE: Record<CommitState, string> = {
  Proposed: "border-rule-strong bg-ink-2 text-scribe-3",
  Voted: "border-probe/40 bg-probe-dim text-probe",
  Finalized: "border-go/40 bg-go-dim text-go",
  Verified: "border-go/70 bg-go-dim text-go",
};
const DOT: Record<CommitState, string> = {
  Proposed: "bg-scribe-3",
  Voted: "bg-probe",
  Finalized: "bg-go",
  Verified: "bg-go",
};

const ms = (v: number | null) => (v === null ? "…" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);

function status(c: Connection, retryIn: number | null) {
  if (c === "live") return { dot: "bg-go animate-pulse", text: "live" };
  if (c === "retrying") return { dot: "bg-reject", text: retryIn ? `disconnected, retrying in ${retryIn} s` : "reconnecting" };
  if (c === "connecting") return { dot: "bg-scribe-3", text: "connecting" };
  return { dot: "bg-scribe-3", text: "paused" };
}

/** Each height once: the surviving proposal, or the furthest-along one while rivals are open. */
function heights(blocks: Block[], n: number) {
  const out: Block[] = [];
  for (const b of blocks) {
    const at = out.findIndex((x) => x.number === b.number);
    if (at === -1) out.push(b);
    if (out.length >= n) break;
  }
  return out;
}

function Chip({ b, now, className }: { b: Block; now: number; className?: string }) {
  const final = b.seen.Finalized !== undefined && b.fromProposed ? b.seen.Finalized - (b.seen.Proposed as number) : null;
  const age = b.fromProposed && b.seen.Proposed !== undefined && final === null ? now - b.seen.Proposed : null;
  return (
    <li
      className={cn(
        "min-w-0 flex-1 flex-col rounded-lg border px-2 py-2 text-left font-mono transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        TONE[b.state],
        className,
      )}
      title={`Block ${b.number.toLocaleString("en-US")} · ${b.state}${b.hash ? ` · ${b.hash}` : ""}`}
    >
      <span className="text-xs tabular-nums text-scribe-2">#{String(b.number).slice(-5)}</span>
      <span className="mt-1 flex items-center gap-1 truncate font-sans text-xs">
        {b.state}
        {b.state === "Verified" ? <span aria-hidden>✓</span> : null}
      </span>
      {/* Once final, the time it took from Proposed; before that, its age. */}
      <span className="mt-1 whitespace-nowrap text-xs tabular-nums text-scribe-3">
        {final !== null ? ms(final) : age !== null ? ms(age) : "joined late"}
      </span>
    </li>
  );
}

/** A clock that ticks while blocks are open, so a Proposed chip's age moves. */
function useNow(on: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!on) return;
    let id = 0;
    const tick = () => { setNow(performance.now()); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [on]);
  return now;
}

export function MonadPipeline({ className }: { className?: string }) {
  const s = useMonadStream();
  const p = s.pipeline;
  const now = useNow(s.connection === "live");
  const shown = heights(p.blocks, 8);
  const head = p.blocks[0]?.number ?? null;
  const st = status(s.connection, s.retryIn);
  const lat = { voted: median(p.latencies.Voted), final: median(p.latencies.Finalized), verified: median(p.latencies.Verified) };
  const perBlock = cadence(p);
  const samples = p.latencies.Finalized.length;

  return (
    <section
      aria-label="Monad testnet block pipeline"
      data-testid="monad-pipeline"
      data-connection={s.connection}
      className={cn("w-full rounded-2xl border border-white/10 bg-ink-1 p-4 text-left sm:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-scribe">
          <span className={cn("inline-block size-2 rounded-full", st.dot)} aria-hidden />
          Monad testnet <span className="text-scribe-3">· {st.text}</span>
        </p>
        <p className="font-mono text-xs tabular-nums text-scribe-3">
          {head !== null ? `block ${head.toLocaleString("en-US")}` : "waiting for a block"}
        </p>
      </div>

      <ol className="mt-4 flex gap-2" aria-live="off">
        {shown.length
          ? shown.map((b, i) => <Chip key={b.blockId} b={b} now={now} className={i >= 4 ? "hidden sm:flex" : "flex"} />)
          : Array.from({ length: 8 }, (_, i) => (
              <li key={i} className={cn("h-[76px] flex-1 animate-pulse rounded-lg border border-rule bg-ink-2", i >= 4 && "hidden sm:block")} />
            ))}
      </ol>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" data-testid="monad-latency">
        {([
          ["A block every", perBlock, "block"],
          ["Proposed → Voted", lat.voted, "voted"],
          ["Proposed → Finalized", lat.final, "final"],
          ["Proposed → Verified", lat.verified, "verified"],
        ] as const).map(([label, v, key]) => (
          <div key={key} className="flex flex-col">
            <dt className="text-xs text-scribe-3">{label}</dt>
            <dd className="font-mono text-base tabular-nums text-scribe" data-key={key}>{ms(v)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-scribe-3">
        Read live from Monad testnet&rsquo;s public WebSocket (<span className="font-mono">monadNewHeads</span>). Every time
        is measured in this browser, as the median of the last {samples || "few"} blocks seen from the moment they were proposed.
        A block is final two slots after it is proposed, and Monad sends no message for a proposal it abandons.
        {LOCALNET ? " This build's own transactions are on the local chain; this strip is the real network." : ""}
      </p>
      <p className="mt-2 text-xs text-scribe-3" data-testid="monad-logs">
        Thenar on Monad: {WATCHED.length} contracts watched with <span className="font-mono">monadLogs</span>
        {s.logs.length
          ? <> · {s.logs.length} event{s.logs.length === 1 ? "" : "s"} since you opened this page, the newest <span className={cn("font-mono", s.logs[0].state === "Proposed" ? "text-scribe-2" : "text-go")}>{s.logs[0].state}</span></>
          : " · no events since you opened this page"}
      </p>
    </section>
  );
}

/** One line for the station: the network's heartbeat and its finality, measured. */
export function MonadHeartbeat({ className }: { className?: string }) {
  const s = useMonadStream();
  const p = s.pipeline;
  const shown = heights(p.blocks, 6);
  const st = status(s.connection, s.retryIn);
  const final = median(p.latencies.Finalized);
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="monad-heartbeat" data-connection={s.connection}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-scribe-2">
          <span className={cn("inline-block size-1.5 rounded-full", st.dot)} aria-hidden />
          Monad testnet, live
        </span>
        <span className="font-mono text-xs tabular-nums text-scribe-3">final in {ms(final)}</span>
      </div>
      <ol className="flex gap-1" aria-label="The last six Monad testnet blocks and their commit state">
        {(shown.length ? shown : Array.from({ length: 6 }, () => null)).map((b, i) => (
          <li
            key={b?.blockId ?? i}
            title={b ? `#${b.number} ${b.state}` : undefined}
            className={cn("h-2 flex-1 rounded-sm transition-colors duration-500", b ? DOT[b.state] : "bg-ink-3", b?.state === "Proposed" && "opacity-50")}
          />
        ))}
      </ol>
    </div>
  );
}
