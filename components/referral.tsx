"use client";

import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { REFERRALS_ABI } from "@/lib/registry-abi";
import { AXON_ABI } from "@/lib/abi";
import { DEPLOYED } from "@/lib/registry";
import { AXON_ADDRESS, CURRENCY, addressUrl, txUrl } from "@/lib/chain";
import { fmtMon, fmtScore, shortHash } from "@/lib/format";
import { Copyable } from "@/components/primitives";

const REFERRALS = DEPLOYED.find((d) => d.key === "referrals")!.address;

/**
 * Who brought you here, and who you brought.
 *
 * The Referrals contract was deployed, funded and paying before this panel
 * existed, and it appeared in this interface only as a row on the contract
 * registry. Nobody could see whether they had been credited, nobody could get
 * a link to give somebody, and the
 * newcomer who had to make the call had no way to make it.
 *
 * The claim is made by the newcomer, never by the referrer, and the contract is
 * explicit about why: a referrer who could claim on someone else's behalf could
 * name themselves the introducer of every address that ever ran the station. So
 * the link an operator shares is an invitation to a page, and the claim happens
 * on the newcomer's own wallet after they have done the work.
 */
export function Referral() {
  const s = useSession();
  const tx = useThenarWrite();

  const bounty = useReadContract({ address: REFERRALS, abi: REFERRALS_ABI, functionName: "bounty" });
  const remaining = useReadContract({ address: REFERRALS, abi: REFERRALS_ABI, functionName: "remaining" });
  const cap = useReadContract({ address: REFERRALS, abi: REFERRALS_ABI, functionName: "MAX_PER_REFERRER" });
  const floor = useReadContract({ address: REFERRALS, abi: REFERRALS_ABI, functionName: "MIN_NEWCOMER_WEIGHT" });

  const brought = useReadContract({
    address: REFERRALS, abi: REFERRALS_ABI, functionName: "referredBy",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });
  const broughtBy = useReadContract({
    address: REFERRALS, abi: REFERRALS_ABI, functionName: "referrerOf",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });
  const mine = useReadContract({
    address: AXON_ADDRESS, abi: AXON_ABI, functionName: "totalScore",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });

  if (!s.connected || !s.address) return null;

  const perClaim = Number(formatEther((bounty.data as bigint | undefined) ?? 0n));
  const left = Number((remaining.data as bigint | undefined) ?? 0n);
  const count = Number((brought.data as number | undefined) ?? 0);
  const limit = Number((cap.data as number | undefined) ?? 0);
  const needed = Number((floor.data as bigint | undefined) ?? 0n);
  const weight = Number((mine.data as bigint | undefined) ?? 0n);
  const referrer = (broughtBy.data as `0x${string}` | undefined) ?? "0x0000000000000000000000000000000000000000";
  const claimed = referrer !== "0x0000000000000000000000000000000000000000";

  const link = typeof window === "undefined"
    ? ""
    : `${window.location.origin}/hub?from=${s.address}`;

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Referrals</span>
        <span className="font-mono text-[13px] text-scribe-2">
          {fmtMon(perClaim, 4)} {CURRENCY} a claim
        </span>
        <span className="font-mono text-[13px] text-scribe-3">
          {left} {left === 1 ? "claim" : "claims"} left in the pot
        </span>
        <span className="font-mono text-[13px] tabular-nums text-scribe">
          you have brought {count}
          <span className="text-scribe-3"> / {limit}</span>
        </span>
      </div>

      <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-scribe-2">
        The claim is made by the newcomer, never by you. A referrer who could
        claim on somebody else&rsquo;s behalf could name themselves the introducer
        of every address that ever ran the station, so the contract only accepts
        it from the wallet being introduced &mdash; and only once that wallet has
        earned {fmtScore(needed)} of recorded score, so a bounty cannot be
        farmed by an address that has never done the work.
      </p>

      <div className="mt-3">
        <span className="label">Your link</span>
        <div className="mt-1"><Copyable value={link} /></div>
      </div>

      {claimed ? (
        <p className="mt-3 font-mono text-[12px] text-scribe-3">
          You were introduced by{" "}
          <a href={addressUrl(referrer)} target="_blank" rel="noreferrer" className="text-signal hover:text-signal-hi">
            {shortHash(referrer)}
          </a>{" "}
          &mdash; the bounty for that is already paid, and an address can only be
          introduced once.
        </p>
      ) : weight < needed ? (
        <p className="mt-3 font-mono text-[12px] text-scribe-3">
          Somebody introduce you? You hold {fmtScore(weight)} of recorded score
          and the contract wants {fmtScore(needed)} before it will pay their
          bounty. Drive a task or two more, then their link will work here.
        </p>
      ) : (
        <ClaimTheirs tx={tx} />
      )}
    </div>
  );
}

/**
 * Naming who brought you, once the work is behind you.
 *
 * Shown only where the contract would accept it: not already claimed, and past
 * the score the contract requires. Every other state is a button that reverts.
 */
function ClaimTheirs({ tx }: { tx: ReturnType<typeof useThenarWrite> }) {
  const from = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("from");
  const valid = from && /^0x[0-9a-fA-F]{40}$/.test(from);

  if (!valid) {
    return (
      <p className="mt-3 font-mono text-[12px] text-scribe-3">
        You have enough recorded work to credit whoever introduced you. Open
        their link &mdash; it carries their address &mdash; and the claim will
        appear here.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={tx.busy}
        onClick={() =>
          tx.run("claim", [from as `0x${string}`], undefined, { address: REFERRALS, abi: REFERRALS_ABI })
        }
        className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
      >
        {tx.phase === "signing" ? "Confirm in wallet…"
          : tx.phase === "pending" ? "Crediting…"
          : `Credit ${shortHash(from!)} for bringing you`}
      </button>
      {tx.error ? <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p> : null}
      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="mt-2 font-mono text-[12px] text-go">
          Credited ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}
    </div>
  );
}
