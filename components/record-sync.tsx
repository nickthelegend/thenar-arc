"use client";

import { useReadContract } from "wagmi";
import { useThenarWrite } from "@/lib/write";
import { CONTRIBUTION_RECORD_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";
import { txUrl } from "@/lib/chain";
import { fmtInt, fmtScore, shortHash } from "@/lib/format";

const RECORD = DEPLOYED.find((d) => d.key === "contribution")!.address;

/**
 * The record of an address's work, and how far behind it is.
 *
 * ContributionRecord holds a non-transferable count of what an address has
 * earned, and it does not update itself — `sync` reads the protocol's own total
 * and mints the difference. The contract's header is explicit that anyone may
 * sync anyone, because there is nothing to gain by it and requiring the holder
 * would leave the record of people who never came back permanently understated.
 *
 * Nothing in this interface called it. So the mechanism designed to keep the
 * record honest for absent operators depended on somebody with a terminal, and
 * one address on this deployment is 189.00 points of recorded work behind its
 * own token right now.
 *
 * Rendered for any address, not only the connected one, for the same reason the
 * contract takes an argument.
 */
export function RecordSync({ address }: { address: `0x${string}` }) {
  const tx = useThenarWrite();

  const held = useReadContract({
    address: RECORD, abi: CONTRIBUTION_RECORD_ABI, functionName: "balanceOf", args: [address],
  });
  const pending = useReadContract({
    address: RECORD, abi: CONTRIBUTION_RECORD_ABI, functionName: "pending", args: [address],
  });

  const have = Number((held.data as bigint | undefined) ?? 0n);
  const behind = Number((pending.data as bigint | undefined) ?? 0n);
  if (held.isLoading || pending.isLoading) return null;
  if (have === 0 && behind === 0) return null;

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Contribution record</span>
        <span className="font-mono text-[13px] tabular-nums text-scribe">
          {fmtInt(have)} recorded
        </span>
        {behind > 0 ? (
          <span className="font-mono text-[13px] tabular-nums text-reject">
            {fmtInt(behind)} behind
          </span>
        ) : (
          <span className="font-mono text-[13px] text-scribe-3">up to date</span>
        )}
      </div>

      <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-scribe-2">
        A non-transferable count of the score this address has earned. It does
        not update itself: <code className="font-mono text-[12px] text-scribe">sync</code>{" "}
        reads the protocol&rsquo;s own total and mints the difference, and anyone
        may call it for anyone &mdash; there is nothing to gain by syncing
        somebody else, and requiring the holder would leave the record of people
        who never came back permanently understated.
      </p>

      {behind > 0 ? (
        <>
          <button
            type="button"
            disabled={tx.busy}
            onClick={() =>
              tx.run("sync", [address], undefined, { address: RECORD, abi: CONTRIBUTION_RECORD_ABI })
            }
            className="mt-3 border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
          >
            {tx.phase === "signing" ? "Confirm in wallet…"
              : tx.phase === "pending" ? "Syncing…"
              : `Sync ${fmtScore(behind)} points of work`}
          </button>
          {tx.error ? (
            <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p>
          ) : null}
          {tx.phase === "confirmed" && tx.txHash ? (
            <p className="mt-2 font-mono text-[12px] text-go">
              Synced ·{" "}
              <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                {shortHash(tx.txHash)}
              </a>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
