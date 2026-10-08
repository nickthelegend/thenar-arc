"use client";

import Link from "next/link";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, CURRENCY, IS_DEPLOYED, appChain, txUrl } from "@/lib/chain";
import { shortHash } from "@/lib/format";
import { formatUsdc, parseUsdc } from "@/lib/usdc";
import { useEnsureUsdcAllowance } from "@/lib/usdc-approve";
import { cn } from "@/lib/cn";
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

  // Escrow is USDC base units (6 decimals) on chain; printed, never floated.
  const left = task.escrowWei;
  const mine = s.address?.toLowerCase() === task.funder.toLowerCase();
  const fundable = !task.closed && !task.policyMinted && !task.expired;

  if (task.expiresAt === null && !task.closed) {
    return (
      <>
        <p className="mt-4 max-w-[64ch] font-mono text-[12px] leading-relaxed text-scribe-3">
          {/* Said from the task's own state, not a guess at the call: createTask and
              createTaskUntil with a zero deadline both leave expiresAt at zero. */}
          No deadline. This task&rsquo;s{" "}
          <code className="text-scribe-2">expiresAt</code> is zero — so it can never
          be closed and the {formatUsdc(left)} {CURRENCY} still escrowed can only
          leave as a payout to an operator.
        </p>
        {fundable ? <TopUp task={task} /> : null}
      </>
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
          {formatUsdc(left)} {CURRENCY} left
        </span>
      </div>

      <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        {task.closed
          ? "Its funder called closeTask after the deadline and took back what was never paid out. Nothing further can be run on it."
          : task.expired
            ? "Past its deadline, so it takes no more runs and its funder may reclaim what is left."
            : "Until then it takes runs. After it, the funder may close it and reclaim whatever was never paid out — only them, only once."}
      </p>

      {mine && task.expired && !task.closed && left > 0n ? (
        <>
          <button
            type="button"
            disabled={tx.busy}
            onClick={() => tx.run("closeTask", [BigInt(task.id)])}
            className="mt-3 border border-scribe bg-scribe px-4 py-2 text-[12px] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
          >
            {tx.phase === "signing" ? "Confirm in wallet…"
              : tx.phase === "pending" ? "Closing…"
              : `Close and reclaim ${formatUsdc(left)} ${CURRENCY}`}
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
      {fundable ? <TopUp task={task} /> : null}
    </div>
  );
}

/**
 * Put more USDC behind a task. `fundTask` is open to anyone, not only the
 * funder, and capped by the protocol's `maxTaskEscrow` across the task's whole
 * escrow. Two transactions: an exact USDC approval (skipped when one already
 * covers it), then the top-up, which pulls it.
 */
function TopUp({ task }: { task: ChainTask }) {
  const s = useSession();
  const tx = useThenarWrite();
  const ensureAllowance = useEnsureUsdcAllowance();
  const [amount, setAmount] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const { data: cap } = useReadContract({
    address: AXON_ADDRESS, abi: AXON_ABI, functionName: "maxTaskEscrow", query: { enabled: IS_DEPLOYED },
  });
  const maxEscrow = cap as bigint | undefined;
  const room = maxEscrow === undefined ? undefined : maxEscrow > task.escrowWei ? maxEscrow - task.escrowWei : 0n;

  const units = (() => {
    if (!/^\d*\.?\d{0,6}$/.test(amount) || !/\d/.test(amount)) return 0n;
    try { return parseUsdc(amount); } catch { return 0n; }
  })();
  const over = room !== undefined && units > room;
  const busy = tx.busy || approving;

  return (
    <div className="mt-4 border-t border-rule pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="label">Top it up</span>
        <span className="font-mono text-[12px] text-scribe-3">
          {room === undefined ? "reading the cap…" : `room for ${formatUsdc(room)} ${CURRENCY} more (cap ${formatUsdc(maxEscrow!)} per task)`}
        </span>
      </div>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!s.connected) return s.connect();
          if (s.wrongNetwork) return s.switchToChain();
          if (units <= 0n || over) return;
          setApproveError(null);
          setApproving(true);
          try {
            await ensureAllowance(AXON_ADDRESS, units);
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            setApproveError(/reject|denied/i.test(m) ? "You did not approve the USDC, so nothing was added." : m.split("\n")[0]);
            return;
          } finally {
            setApproving(false);
          }
          const r = await tx.run("fundTask", [BigInt(task.id), units]);
          if (r) setAmount("");
        }}
      >
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.50"
          aria-label={`Top-up in ${CURRENCY}`}
          className={cn(
            "w-[120px] border bg-ink-2 px-3 py-1.5 text-right font-mono text-[13px] text-scribe focus:outline-none",
            over ? "border-reject" : "border-rule focus:border-rule-strong",
          )}
        />
        <span className="text-[12px] text-scribe-3">{CURRENCY}</span>
        <button
          type="submit"
          disabled={busy || (s.connected && !s.wrongNetwork && (units <= 0n || over))}
          className="border border-rule-strong bg-ink-3 px-3 py-1.5 text-[12px] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
        >
          {approving ? "Approve in wallet…"
            : tx.phase === "signing" ? "Confirm in wallet…"
            : tx.phase === "pending" ? "Adding…"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? `Switch to ${appChain.name}`
            : "Approve and add"}
        </button>
      </form>
      {over ? <p className="mt-2 text-[12px] text-reject">That would take the escrow past the protocol&rsquo;s cap.</p> : null}
      {approveError ? <p role="alert" className="mt-2 text-[13px] text-reject">{approveError}</p> : null}
      {tx.error ? <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p> : null}
      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="mt-2 font-mono text-[12px] text-go">
          Added ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}
      <p className="mt-2 max-w-[64ch] text-[12px] leading-relaxed text-scribe-3">
        Anyone may fund a bounty, not only the person who posted it.{" "}
        {mineNote(s.address, task.funder)}
      </p>
    </div>
  );
}

const mineNote = (me: string | null, funder: string) =>
  me && me.toLowerCase() === funder.toLowerCase()
    ? "What you add follows the task's own rules: reclaimable after its deadline if it has one."
    : "What you add belongs to the task: if it has a deadline, only its funder can reclaim the unspent part.";
