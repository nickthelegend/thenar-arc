"use client";

import type { Timers } from "@/lib/receipt-timers";
import { useArcHeartbeat } from "@/lib/arc-blocks";
import { cn } from "@/lib/cn";
import { Chip, Details } from "@/components/details";

/**
 * The one timer for a transaction this page sent: send to final.
 *
 * On Arc a block is final when it is produced, so the receipt is the
 * settlement and there is nothing after it to wait for. The card shows the
 * time, the block, and the check behind the word: whether the node's
 * `finalized` tag already covered that block when it was read. On a fork build
 * the number is the fork's (its node mines on demand and its finalized tag
 * trails by dozens of blocks), and the card sets Arc testnet's measured block
 * interval beside it instead of letting a local number pass for Arc's.
 */

const ms = (v?: number | null) =>
  v === undefined || v === null ? "…" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.max(0, Math.round(v))} ms`;

export function ReceiptTimers({ timers, className }: { timers?: Timers; className?: string }) {
  const beat = useArcHeartbeat();
  if (!timers) return null;
  const fork = timers.where === "fork";
  const block = timers.blockNumber !== undefined ? `block ${timers.blockNumber.toLocaleString("en-US")}` : "";
  const note = timers.timedOut
    ? "no receipt arrived in the time allowed"
    : timers.finalMs === undefined
      ? "waiting for the block that includes it"
      : [
          block,
          timers.via === "eth_sendRawTransactionSync" ? "receipt in the send's own response" : "receipt read back from the node",
          timers.finalizedTagCovers === true
            ? "the finalized tag already covered it"
            : timers.finalizedTagCovers === false && timers.finalizedLag !== undefined
              ? `this node's finalized tag trails its head by ${timers.finalizedLag} block${timers.finalizedLag === 1 ? "" : "s"}`
              : "",
        ].filter(Boolean).join(" · ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="receipt-timers" data-where={timers.where}>
      {/* One line: the time, and whose chain it is. The method and caveats sit under Details. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-scribe-3">
          Final <span className="text-sm tabular-nums text-go" data-key="final">{timers.timedOut ? "not seen" : ms(timers.finalMs)}</span>
        </span>
        {fork ? <Chip>local fork</Chip> : <Chip tone="go">Arc</Chip>}
      </div>
      <Details>
        <p className="[overflow-wrap:anywhere]">{note}</p>
        <p>
          {fork ? (
            <>
              Timed on the local Arc fork, not on Arc: the fork&rsquo;s node mines on demand.
              {beat.intervalMs !== null ? <> Arc right now makes a block every {ms(beat.intervalMs)}, and a block is final when it is made.</> : null}
            </>
          ) : (
            <>Measured in this browser on Arc, from the moment the wallet sent the transaction to its receipt. Arc is final on inclusion, so that is the whole wait.</>
          )}
        </p>
      </Details>
    </div>
  );
}
