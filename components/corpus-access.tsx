"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { CORPUS_ACCESS_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";
import { CURRENCY, txUrl } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";

const ACCESS = DEPLOYED.find((d) => d.key === "corpusAccess")!.address;

/**
 * The only way to buy the thing the corpus gate sells.
 *
 * /api/dataset answers 402 without an active subscription on CorpusAccess. The
 * contract has been deployed, verified, and read by that route since the gate
 * shipped — and `subscribe` was reachable from no page in this interface, so a
 * buyer met a payment-required and had nowhere to go. The product's entire
 * revenue path ended in a status code.
 *
 * Everything below is read from the contract at load: the price, the bounds it
 * enforces, and whether this wallet already has time on it. Extending adds to
 * whatever is left rather than replacing it, which the contract does and this
 * says, because a buyer renewing early should not fear losing the days they
 * already paid for.
 */
export function CorpusAccessPanel() {
  const s = useSession();
  const tx = useThenarWrite();
  const [days, setDays] = useState(7);

  const price = useReadContract({ address: ACCESS, abi: CORPUS_ACCESS_ABI, functionName: "pricePerDay" });
  const minDays = useReadContract({ address: ACCESS, abi: CORPUS_ACCESS_ABI, functionName: "MIN_DAYS" });
  const maxDays = useReadContract({ address: ACCESS, abi: CORPUS_ACCESS_ABI, functionName: "MAX_DAYS" });
  const remaining = useReadContract({
    address: ACCESS, abi: CORPUS_ACCESS_ABI, functionName: "remaining",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });

  const perDayWei = (price.data as bigint | undefined) ?? 0n;
  const perDay = Number(formatEther(perDayWei));
  const lo = Number((minDays.data as bigint | number | undefined) ?? 1);
  const hi = Number((maxDays.data as bigint | number | undefined) ?? 365);
  const dueWei = perDayWei * BigInt(days);
  const secondsLeft = Number((remaining.data as bigint | undefined) ?? 0n);
  const daysLeft = Math.floor(secondsLeft / 86_400);

  const valid = days >= lo && days <= hi;
  const affordable = s.balance >= Number(formatEther(dueWei));

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Bulk access</span>
        <span className="font-mono text-[13px] text-scribe-2">
          {perDay > 0 ? `${fmtMon(perDay, 4)} ${CURRENCY} a day` : "reading the price…"}
        </span>
        {s.connected ? (
          <span className={`font-mono text-[13px] ${secondsLeft > 0 ? "text-signal" : "text-scribe-3"}`}>
            {secondsLeft > 0
              ? `you have ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
              : "no active subscription on this wallet"}
          </span>
        ) : null}
      </div>

      <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-scribe-2">
        It sells time, not rights. A subscription lets{" "}
        <code className="font-mono text-[12px] text-scribe">/api/dataset</code>{" "}
        hand you the whole corpus as newline-delimited JSON for as long as it
        runs; it conveys no ownership of anything, and every episode stays
        readable one at a time by hash without paying at all. Extending adds to
        whatever is left rather than replacing it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[1, 7, 30, 90].filter((d) => d >= lo && d <= hi).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={
              days === d
                ? "border border-signal bg-signal-dim px-2.5 py-1 font-mono text-[12px] text-signal-hi"
                : "border border-rule px-2.5 py-1 font-mono text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe-2"
            }
          >
            {d} {d === 1 ? "day" : "days"}
          </button>
        ))}
        <span className="font-mono text-[13px] tabular-nums text-scribe">
          {fmtMon(Number(formatEther(dueWei)), 4)} {CURRENCY}
        </span>
      </div>

      <button
        type="button"
        disabled={tx.busy || !valid}
        onClick={async () => {
          if (!s.connected) return s.connect();
          if (s.wrongNetwork) return s.switchToChain();
          await tx.run("subscribe", [days], dueWei, { address: ACCESS, abi: CORPUS_ACCESS_ABI });
          remaining.refetch();
        }}
        className="mt-3 border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
      >
        {tx.phase === "signing" ? "Confirm in wallet…"
          : tx.phase === "pending" ? "Subscribing…"
          : !s.connected ? "Connect a wallet"
          : s.wrongNetwork ? "Switch to Avalanche"
          : !affordable ? "More than this wallet holds"
          : secondsLeft > 0 ? `Extend by ${days} ${days === 1 ? "day" : "days"}`
          : `Subscribe for ${days} ${days === 1 ? "day" : "days"}`}
      </button>

      {tx.error ? (
        <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p>
      ) : null}
      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="mt-2 font-mono text-[12px] text-go">
          Subscribed ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-scribe-3">
        {lo}&ndash;{hi} days, enforced by the contract at {shortHash(ACCESS)}, which
        forwards the payment to the treasury in the same call. The gate reads the
        same contract, so what you buy here is exactly what it checks.
      </p>
    </div>
  );
}
