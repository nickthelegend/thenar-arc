"use client";

import { useState } from "react";
import { useReadContract, useSignMessage } from "wagmi";
import { formatEther } from "viem";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { CORPUS_ACCESS_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";
import { CURRENCY, txUrl, appChain } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";
import { corpusDownloadMessage, PROOF_WINDOW_SECONDS } from "@/lib/corpus-proof";

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
/** Time left on a subscription, in the unit that does not round it to nothing. */
export function timeLeft(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))} min left`;
  if (seconds < 86_400) return `${Math.ceil(seconds / 3600)} h left`;
  let d = Math.floor(seconds / 86_400);
  let h = Math.round((seconds % 86_400) / 3600);
  if (h === 24) { d += 1; h = 0; }
  return `${d} ${d === 1 ? "day" : "days"}${h ? ` ${h} h` : ""} left`;
}

export function CorpusAccessPanel({ taskId = "all" }: { taskId?: number | "all" }) {
  const s = useSession();
  const tx = useThenarWrite();
  const [days, setDays] = useState(7);
  const { signMessageAsync } = useSignMessage();
  const [pull, setPull] = useState<{ busy: boolean; note: string | null; failed: boolean }>({ busy: false, note: null, failed: false });

  /** Sign for this one task, fetch it with the signature, and save the file. */
  const download = async (id: number) => {
    if (!s.address) return;
    setPull({ busy: true, note: null, failed: false });
    try {
      const until = Math.floor(Date.now() / 1000) + PROOF_WINDOW_SECONDS - 30;
      const signature = await signMessageAsync({ message: corpusDownloadMessage(s.address, id, until) });
      const r = await fetch(`/api/dataset?taskId=${id}`, {
        headers: { "x-subscriber": s.address, "x-subscriber-signature": signature, "x-subscriber-until": String(until) },
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? `The server answered ${r.status}.`);
      }
      const blob = await r.blob();
      const name = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `thenar-task-${id}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setPull({ busy: false, note: `Saved ${name}, ${(blob.size / 1024).toFixed(0)} KB.`, failed: false });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setPull({ busy: false, failed: true, note: /reject|denied|User rejected/i.test(m) ? "You did not sign, so nothing was downloaded." : m.split("\n")[0] });
    }
  };

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
            {secondsLeft > 0 ? `you have ${timeLeft(secondsLeft)}` : "no active subscription on this wallet"}
          </span>
        ) : null}
      </div>

      <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-scribe-2">
        It sells time, not rights. While it runs,{" "}
        <code className="font-mono text-[12px] text-scribe">/api/dataset</code>{" "}
        hands you a task&rsquo;s whole corpus as one JSON file, once you sign the
        download with the subscribing wallet; it conveys no ownership of
        anything, and every episode stays readable one at a time by hash without
        paying at all. Extending adds to whatever is left rather than replacing it.
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
        className="mt-3 border border-scribe bg-scribe px-4 py-2 text-[12px] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
      >
        {tx.phase === "signing" ? "Confirm in wallet…"
          : tx.phase === "pending" ? "Subscribing…"
          : !s.connected ? "Connect a wallet"
          : s.wrongNetwork ? `Switch to ${appChain.name}`
          : !affordable ? "More than this wallet holds"
          : secondsLeft > 0 ? `Extend by ${days} ${days === 1 ? "day" : "days"}`
          : `Subscribe for ${days} ${days === 1 ? "day" : "days"}`}
      </button>

      {tx.error ? (
        <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p>
      ) : null}

      {s.connected && secondsLeft > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {taskId === "all" ? (
            <span className="text-[13px] text-scribe-3">Pick a task below to download its corpus.</span>
          ) : (
            <button
              type="button"
              disabled={pull.busy}
              onClick={() => download(taskId)}
              className="border border-rule-strong px-4 py-2 text-[12px] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
            >
              {pull.busy ? "Sign in your wallet…" : `Download task #${taskId}`}
            </button>
          )}
          {pull.note ? (
            <span role={pull.failed ? "alert" : undefined} className={`text-[13px] ${pull.failed ? "text-reject" : "text-go"}`}>{pull.note}</span>
          ) : null}
        </div>
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
