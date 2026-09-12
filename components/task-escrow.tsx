"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { AXON_ADDRESS, CURRENCY, txUrl } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";
import type { ChainTask } from "@/lib/hooks";

/**
 * The deadline, and what happens to the money at it.
 *
 * The protocol has two ways to open work and they are not the same offer.
 * `createTask` leaves `expiresAt` at zero, and a task that never expires can
 * never be closed — escrow enters and the only way out is a payout, so
 * whatever nobody earns stays in the contract. `createTaskUntil` sets a
 * deadline, after which the funder may call `closeTask` and take back what was
 * never drawn.
 *
 * The interface could not see either. It decoded a version-one Task, nine
 * fields where the deployed contract has eleven, so `expiresAt` and `closed`
 * were read past and dropped — which is how a closed task with nothing left in
 * it still carried a Run button. This is the funder's half of the same fix.
 *
 * The button appears only for the funder, only past the deadline, and only
 * while there is something to return. Those are the contract's own conditions;
 * showing it anywhere else would be offering a call that reverts.
 */
export function TaskEscrow({ task }: { task: ChainTask }) {
  const s = useSession();
  const tx = useThenarWrite();

  const left = Number(formatEther(task.escrowWei));
  const mine = s.address?.toLowerCase() === task.funder.toLowerCase();

  if (task.expiresAt === null && !task.closed) {
    return (
      <p className="mt-4 max-w-[64ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        No deadline. This task was posted with{" "}
        <code className="text-scribe-2">createTask</code>, which leaves{" "}
        <code className="text-scribe-2">expiresAt</code> at zero — so it can never
        be closed and the {fmtMon(left, 4)} {CURRENCY} still escrowed can only
        leave as a payout to an operator.
      </p>
    );
  }

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Deadline</span>
        <span className={`font-mono text-[13px] ${task.closed || task.expired ? "text-reject" : "text-scribe"}`}>
          {task.closed
            ? "closed — the escrow went back to the funder"
            : task.expired
              ? `passed ${new Date(task.expiresAt!).toLocaleDateString()}`
              : `${new Date(task.expiresAt!).toLocaleString()}`}
        </span>
        <span className="font-mono text-[13px] tabular-nums text-scribe-2">
          {fmtMon(left, 4)} {CURRENCY} left
        </span>
      </div>

      <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        {task.closed
          ? "Its funder called closeTask after the deadline and took back what was never paid out. Nothing further can be run on it."
          : task.expired
            ? "Past its deadline, so it takes no more runs and its funder may reclaim what is left."
            : "Until then it takes runs. After it, the funder may close it and reclaim whatever was never paid out — only them, only once."}
      </p>

      {mine && task.expired && !task.closed && left > 0 ? (
        <>
          <button
            type="button"
            disabled={tx.busy}
            onClick={() => tx.run("closeTask", [BigInt(task.id)])}
            className="mt-3 border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
          >
            {tx.phase === "signing" ? "Confirm in wallet…"
              : tx.phase === "pending" ? "Closing…"
              : `Close and reclaim ${fmtMon(left, 4)} ${CURRENCY}`}
          </button>
          {tx.error ? (
            <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p>
          ) : null}
          {tx.phase === "confirmed" && tx.txHash ? (
            <p className="mt-2 font-mono text-[12px] text-go">
              Closed ·{" "}
              <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                {shortHash(tx.txHash)}
              </a>
            </p>
          ) : null}
        </>
      ) : null}

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-scribe-3">
        Enforced by the contract, not by this page:{" "}
        <Link href="/contracts" className="text-signal hover:text-signal-hi">
          {shortHash(AXON_ADDRESS)}
        </Link>{" "}
        refuses a close from anyone but the funder, before the deadline, or twice.
      </p>
    </div>
  );
}
