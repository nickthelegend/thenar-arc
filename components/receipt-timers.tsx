"use client";

import type { Timers } from "@/lib/receipt-timers";
import { median } from "@/lib/monad-commit";
import { useMonadStream } from "@/lib/monad-stream";
import { cn } from "@/lib/cn";

/**
 * The two timers for a transaction this page sent: executed, then final.
 *
 * On Monad they are the chain's own pace, measured here. On a local build
 * they are anvil's, which mines on demand and calls every block final at once,
 * so the card says that in words and sets the real network's finality beside
 * it, read live, instead of letting a local number pass for a Monad one.
 */

const ms = (v?: number) => (v === undefined ? "…" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.max(0, Math.round(v))} ms`);

export function ReceiptTimers({ timers, className }: { timers?: Timers; className?: string }) {
  const stream = useMonadStream();
  if (!timers) return null;
  const local = timers.where === "local";
  const liveFinal = median(stream.pipeline.latencies.Finalized);
  const rows: [string, string, string, string][] = [];
  if (timers.seen) rows.push(["seen", "Seen by the node", ms(timers.seen.ms), `txpool_statusByHash: ${timers.seen.status}`]);
  rows.push([
    "executed",
    "Executed",
    ms(timers.executedMs),
    timers.via === "eth_sendRawTransactionSync" ? "receipt in the send's own response (eth_sendRawTransactionSync)" : local ? "receipt read back from the node" : "receipt at Proposed, one block in",
  ]);
  const lag = timers.finalizedLag;
  rows.push([
    "final",
    "Final",
    timers.timedOut ? "not seen" : timers.finalMs === undefined ? "waiting" : ms(timers.finalMs),
    timers.timedOut
      ? "the finalized tag did not reach this block in time"
      : `${timers.finalMs === undefined ? "waiting for " : ""}${timers.blockNumber !== undefined ? `block ${timers.blockNumber.toLocaleString("en-US")} ` : ""}${timers.finalMs === undefined ? "to reach the finalized tag" : "at the finalized tag, hash checked"}${timers.moved ? " (it moved to another proposal first)" : ""}${!local && lag !== undefined ? `; the tag trails the head by ${lag} block${lag === 1 ? "" : "s"}` : ""}`,
  ]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="receipt-timers" data-where={timers.where}>
      <dl className="flex flex-col gap-1">
        {rows.map(([key, label, value, note]) => (
          <div key={key} className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-[108px] shrink-0 text-scribe-3">{label}</dt>
            <dd className="w-[64px] shrink-0 tabular-nums text-scribe" data-key={key}>{value}</dd>
            <dd className="w-full min-w-0 text-scribe-3 [overflow-wrap:anywhere] sm:w-auto sm:flex-1">{note}</dd>
          </div>
        ))}
      </dl>
      <p className="leading-relaxed text-scribe-3">
        {local ? (
          <>
            Local chain timings, not Monad&rsquo;s: anvil mines on demand, and its finalized tag trails the head by
            {lag !== undefined ? ` ${lag} blocks` : " dozens of blocks"}, the way Ethereum&rsquo;s trails by two epochs. Monad&rsquo;s trails by two.
            {liveFinal !== null ? <> Monad testnet right now finalizes a block {ms(liveFinal)} after it is proposed, measured live in this page.</> : null}
          </>
        ) : (
          <>Measured in this browser on Monad testnet, from the moment the wallet sent the transaction. The signing prompt is in neither number.</>
        )}
      </p>
    </div>
  );
}
