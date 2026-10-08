"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { Button, DimRule } from "@/components/primitives";
import { AXON_ABI } from "@/lib/abi";
import { ARC_NETWORK, AXON_ADDRESS, CHAIN_SHORT, IS_DEPLOYED, LOCALNET, USDC, txUrl } from "@/lib/chain";
import { CCTP_DESTINATIONS, TOKEN_MESSENGER_V2_ABI, irisMessagesUrl, parseIrisMessages, planCctpWithdraw, type CctpNetwork, type IrisMessage } from "@/lib/cctp";
import { cn } from "@/lib/cn";
import { useContractWrite } from "@/lib/contract-write";
import { explainTxError } from "@/lib/submit";
import { useEnsureUsdcAllowance } from "@/lib/usdc-approve";
import { USDC_ABI, formatUsdc, parseUsdc, usdcLabel } from "@/lib/usdc";
import { useThenarWrite } from "@/lib/write";

/**
 * An operator's money on Arc: what they hold, what is waiting for them, and
 * how to take it to another chain.
 *
 * Every figure is USDC base units (6 decimals) read from the chain: the
 * wallet's `balanceOf` on Circle's USDC, and ThenarProtocol's `claimable`,
 * which holds a payout whose transfer was refused at submit time.
 *
 * The withdraw is Circle's CCTP V2 and nothing of ours: approve
 * TokenMessengerV2, `depositForBurn` on Arc, Circle's Iris attests the burn,
 * and `receiveMessage` on the destination mints native USDC there. This panel
 * does the first two, polls Iris from the browser and shows its answer; the
 * mint is a transaction on the other chain, which it explains rather than
 * pretends to have made.
 */

/** A fork of Arc testnet burns on testnet's TokenMessengerV2, so it offers testnet's destinations. */
const CCTP_NET: CctpNetwork = ARC_NETWORK === "mainnet" ? "mainnet" : "testnet";
const DESTINATIONS = CCTP_DESTINATIONS[CCTP_NET];

export function useUsdcBalance(who?: Address | null) {
  return useReadContract({
    address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: who ? [who] : undefined,
    query: { enabled: Boolean(who), refetchInterval: 8_000 },
  });
}

export function useClaimable(who?: Address | null) {
  return useReadContract({
    address: AXON_ADDRESS, abi: AXON_ABI, functionName: "claimable", args: who ? [who] : undefined,
    query: { enabled: IS_DEPLOYED && Boolean(who), refetchInterval: 8_000 },
  });
}

/** Claimable USDC, with the one button that pays it out. Says nothing when there is nothing to claim. */
export function ClaimPanel({ address }: { address: Address }) {
  const { data } = useClaimable(address);
  const tx = useThenarWrite();
  const owed = (data as bigint | undefined) ?? 0n;
  if (owed === 0n && tx.phase !== "confirmed") return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-signal bg-signal-dim px-4 py-3" data-testid="claim-panel">
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-scribe-2">
        {tx.phase === "confirmed" ? (
          <>Claimed. The USDC is in your wallet.</>
        ) : (
          <>
            <span className="font-mono text-signal">{usdcLabel(owed)}</span> is waiting for you in the protocol: a payout
            whose transfer was refused when the run settled is held here instead of lost.
          </>
        )}
        {tx.txHash ? (
          <>
            {" "}
            <a href={txUrl(tx.txHash)} target={LOCALNET ? undefined : "_blank"} rel="noreferrer" className="font-mono text-probe hover:underline">
              {tx.txHash.slice(0, 10)}… →
            </a>
          </>
        ) : null}
        {tx.error ? <span role="alert" className="block text-reject">{tx.error}</span> : null}
      </p>
      {tx.phase !== "confirmed" ? (
        <Button variant="primary" disabled={tx.busy} onClick={() => void tx.run("claim", [])}>
          {tx.phase === "signing" ? "Confirm in your wallet…" : tx.phase === "pending" ? "Claiming…" : "Claim"}
        </Button>
      ) : null}
    </div>
  );
}

type Stage =
  | { k: "idle" }
  | { k: "approving" }
  | { k: "burning"; approval: Hex | null }
  | { k: "burned"; hash: Hex; approval: Hex | null; iris: IrisMessage | null; checkedAt: number | null; irisError: string | null }
  | { k: "error"; message: string };

/** Withdraw Arc earnings to another chain with CCTP V2. */
export function CctpWithdraw({ address }: { address: Address }) {
  const client = usePublicClient();
  const { address: connected } = useAccount();
  const ensure = useEnsureUsdcAllowance();
  const { writeContractAsync } = useContractWrite();
  const { data: bal, refetch } = useUsdcBalance(address);
  const balance = (bal as bigint | undefined) ?? 0n;

  const [dest, setDest] = useState(DESTINATIONS[0].key);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [fast, setFast] = useState(true);
  const [stage, setStage] = useState<Stage>({ k: "idle" });

  const destination = DESTINATIONS.find((d) => d.key === dest) ?? DESTINATIONS[0];
  const to = (recipient.trim() || address) as Address;

  const plan = useMemo(() => {
    try {
      const units = parseUsdc(amount || "0");
      if (units <= 0n) return { error: null, plan: null };
      if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return { error: "The recipient must be an address.", plan: null };
      if (units > balance) return { error: `This wallet holds ${usdcLabel(balance)}.`, plan: null };
      return { error: null, plan: planCctpWithdraw(CCTP_NET, { destination, amount: units, recipient: to, fast }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "That amount cannot be withdrawn.", plan: null };
    }
  }, [amount, to, balance, destination, fast]);

  const busy = stage.k === "approving" || stage.k === "burning";
  const mine = connected?.toLowerCase() === address.toLowerCase();

  async function withdraw() {
    if (!plan.plan || !client) return;
    const p = plan.plan;
    try {
      setStage({ k: "approving" });
      const approval = await ensure(p.tokenMessenger, p.amount);
      setStage({ k: "burning", approval });
      const hash = await writeContractAsync({ address: p.tokenMessenger, abi: TOKEN_MESSENGER_V2_ABI, functionName: "depositForBurn", args: p.args });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The burn reverted on chain.");
      setStage({ k: "burned", hash, approval, iris: null, checkedAt: null, irisError: null });
      setAmount("");
      void refetch();
    } catch (e) {
      setStage({ k: "error", message: explainTxError(e) });
    }
  }

  // Ask Iris for the burn's attestation every five seconds until it is complete. Not on a fork: Iris never saw that burn.
  const burnHash = stage.k === "burned" ? stage.hash : null;
  const complete = stage.k === "burned" && stage.iris?.status === "complete";
  useEffect(() => {
    if (!burnHash || complete || LOCALNET) return;
    let live = true;
    let t: ReturnType<typeof setTimeout>;
    const ask = async () => {
      try {
        const r = await fetch(irisMessagesUrl(CCTP_NET, burnHash));
        const json = r.status === 404 ? null : await r.json();
        const [m] = parseIrisMessages(json);
        if (live) setStage((s) => (s.k === "burned" && s.hash === burnHash ? { ...s, iris: m ?? null, checkedAt: Date.now(), irisError: null } : s));
        if (m?.status === "complete") return;
      } catch (e) {
        if (live) setStage((s) => (s.k === "burned" ? { ...s, checkedAt: Date.now(), irisError: e instanceof Error ? e.message : "Iris did not answer" } : s));
      }
      if (live) t = setTimeout(ask, 5_000);
    };
    void ask();
    return () => { live = false; clearTimeout(t); };
  }, [burnHash, complete]);

  return (
    <section aria-labelledby="cctp-title" data-testid="cctp-withdraw">
      <DimRule className="mt-10" note="Withdraw to another chain" />
      <h2 id="cctp-title" className="sr-only">Withdraw to another chain</h2>
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        Your earnings are native USDC on {CHAIN_SHORT}. Circle&rsquo;s CCTP burns them here and mints the same USDC on the
        chain you pick: no bridge, no wrapped token. Fast transfers are attested in seconds for a small fee (at most 1%);
        standard ones are free and wait for the source chain&rsquo;s finality, which on Arc is immediate, so the wait is
        Circle&rsquo;s attestation only.
      </p>
      {LOCALNET ? (
        <p className="mt-3 max-w-[64ch] border border-rule px-3 py-2 text-[13px] leading-relaxed text-scribe-3">
          On this fork the burn is a real <span className="font-mono">depositForBurn</span> on Circle&rsquo;s TokenMessengerV2 as
          deployed on Arc testnet, but Circle&rsquo;s Iris only attests burns on the real chain, so this one will never be
          attested or minted anywhere.
        </p>
      ) : null}

      <div className="mt-5 grid gap-px border border-rule bg-rule sm:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4 bg-ink-1 p-5">
          <div className="flex flex-col gap-1.5">
            <span className="label" id="cctp-to">To</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="cctp-to">
              {DESTINATIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={d.key === dest}
                  disabled={busy}
                  onClick={() => setDest(d.key)}
                  className={cn(
                    "border px-3 py-1.5 text-[13px] transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.97]",
                    d.key === dest ? "border-scribe text-scribe" : "border-rule-strong text-scribe-3 hover:border-scribe-2 hover:text-scribe-2",
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="label">Amount</span>
              <button type="button" disabled={busy || balance === 0n} onClick={() => setAmount(formatUsdc(balance))} className="font-mono text-[12px] text-scribe-3 hover:text-probe">
                max {usdcLabel(balance)}
              </button>
            </span>
            <span className="flex items-center border border-rule-strong bg-ink-0 focus-within:border-scribe-2">
              <input
                inputMode="decimal"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full bg-transparent px-3 py-2 font-mono text-[15px] tabular-nums text-scribe outline-none"
                aria-label="Amount of USDC to withdraw"
              />
              <span className="px-3 font-mono text-[12px] text-scribe-3">USDC</span>
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="label">Recipient on {destination.name}</span>
            <input
              value={recipient}
              disabled={busy}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder={address}
              spellCheck={false}
              className="border border-rule-strong bg-ink-0 px-3 py-2 font-mono text-[13px] text-scribe outline-none focus:border-scribe-2"
              aria-label="Recipient address on the destination chain"
            />
          </label>

          <label className="flex items-center gap-2 text-[13px] text-scribe-2">
            <input type="checkbox" checked={fast} disabled={busy} onChange={(e) => setFast(e.target.checked)} className="accent-signal" />
            Fast transfer (seconds, fee capped at {plan.plan ? usdcLabel(plan.plan.maxFee) : "1%"})
          </label>
        </div>

        <div className="flex flex-col justify-between gap-4 bg-ink-1 p-5">
          <dl className="flex flex-col gap-2 font-mono text-[12px]">
            <Row k="Burn on" v={`${CHAIN_SHORT} · CCTP domain 26`} />
            <Row k="Mint on" v={`${destination.name} · domain ${destination.cctpDomain}`} />
            <Row k="You receive" v={plan.plan ? `≥ ${usdcLabel(plan.plan.amount - plan.plan.maxFee)}` : "—"} />
            <Row k="Finality threshold" v={plan.plan ? String(plan.plan.minFinalityThreshold) : "—"} />
          </dl>
          {plan.error ? <p className="text-[13px] text-reject">{plan.error}</p> : null}
          <Button variant="primary" disabled={!plan.plan || busy || !mine} onClick={() => void withdraw()}>
            {!mine ? "Connect this wallet to withdraw"
              : stage.k === "approving" ? "Approving USDC…"
              : stage.k === "burning" ? "Burning on Arc…"
              : "Approve and burn"}
          </Button>
        </div>
      </div>

      {stage.k === "error" ? <p role="alert" className="mt-3 border border-reject bg-reject-dim px-3 py-2 text-[13px] text-reject">{stage.message}</p> : null}

      {stage.k === "burned" ? (
        <div className="mt-3 flex flex-col gap-2 border border-rule px-4 py-3 font-mono text-[12px] text-scribe-3" data-testid="cctp-status" aria-live="polite">
          {stage.approval ? (
            <span>approved · <a href={txUrl(stage.approval)} target={LOCALNET ? undefined : "_blank"} rel="noreferrer" className="text-probe hover:underline">{stage.approval.slice(0, 10)}… →</a></span>
          ) : null}
          <span>
            burned on {CHAIN_SHORT}, final in its block ·{" "}
            <a href={txUrl(stage.hash)} target={LOCALNET ? undefined : "_blank"} rel="noreferrer" className="text-probe hover:underline">{stage.hash.slice(0, 10)}… →</a>
          </span>
          {LOCALNET ? (
            <span>Iris: not asked. A fork&rsquo;s burn is invisible to Circle, so there is no attestation to wait for.</span>
          ) : (
            <span>
              Iris: {stage.iris ? <span className={stage.iris.status === "complete" ? "text-go" : "text-scribe-2"}>{stage.iris.status === "complete" ? "attested" : stage.iris.status.replace(/_/g, " ")}</span> : "not seen yet"}
              {stage.checkedAt ? ` · asked ${new Date(stage.checkedAt).toLocaleTimeString()}` : " · asking…"}
              {stage.irisError ? <span className="text-reject"> · {stage.irisError}</span> : null}
            </span>
          )}
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-scribe-2">
            {stage.iris?.status === "complete" && stage.iris.message && stage.iris.attestation ? (
              <>
                The attestation is ready. To mint, call <span className="font-mono">receiveMessage(message, attestation)</span> on
                MessageTransmitterV2{" "}
                <a href={`${destination.explorer}/address/${destination.messageTransmitterV2}#writeContract`} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
                  {destination.messageTransmitterV2.slice(0, 10)}…
                </a>{" "}
                on {destination.name} from any wallet with gas there{fast ? ", or wait: fast transfers are usually relayed for you" : ""}. Both values are below.
              </>
            ) : LOCALNET ? (
              <>
                On Arc, Iris would attest this burn within seconds and anyone could then call{" "}
                <span className="font-mono">receiveMessage</span> on {destination.name}&rsquo;s MessageTransmitterV2 to mint the
                USDC. On this fork the burn is final and the USDC is gone from the fork; nothing will be minted.
              </>
            ) : (
              <>
                Once Iris attests the burn, anyone can call <span className="font-mono">receiveMessage</span> on {destination.name}&rsquo;s
                MessageTransmitterV2 with the message and attestation to mint the USDC to {to.slice(0, 8)}…. Nothing is minted until
                that call is made.
              </>
            )}
          </p>
          {stage.iris?.message && stage.iris.attestation ? (
            <details>
              <summary className="cursor-pointer text-scribe-2">message and attestation</summary>
              <p className="mt-2 break-all text-scribe-3">message {stage.iris.message}</p>
              <p className="mt-2 break-all text-scribe-3">attestation {stage.iris.attestation}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-scribe-3">{k}</dt>
      <dd className="text-right text-scribe">{v}</dd>
    </div>
  );
}
