"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toHex, type Address, type Hex } from "viem";
import { usePublicClient, useSignTypedData } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/session";
import { AXON_ABI } from "@/lib/abi";
import { ARC_NETWORK, AXON_ADDRESS, CURRENCY, LOCALNET, USDC, appChain, txUrl } from "@/lib/chain";
import { RECEIVE_WITH_AUTHORIZATION_TYPES, USDC_EIP712_DOMAIN, formatUsdc, parseUsdc } from "@/lib/usdc";
import {
  GATEWAY_MAX_VALUE, buildBurnIntent, burnIntentToJson, burnIntentTypedData, gatewayFor, gatewayMaxFee,
} from "@/lib/gateway";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";

/** The task exactly as ThenarProtocol.TaskParams takes it, minus the deadline (fixed at the click). */
export type DraftTask = {
  name: string;
  slots: number;
  rewardPerTrajectory: bigint;
  scenario: number;
  difficulty: number;
  /** Days until the funder may reclaim; 0 = no deadline. */
  days: number;
  amount: bigint;
};

type StepState = "waiting" | "active" | "done" | "failed" | "skipped";
type Step = { key: string; title: string; does: string; state: StepState; note?: React.ReactNode };

const GATEWAY = gatewayFor(ARC_NETWORK);

/**
 * Two ways to post a task without paying gas, both built on a signature the
 * sponsor's wallet makes and a relayer that submits it.
 *
 * "Post without gas" is EIP-3009 on Circle's USDC: the wallet signs a
 * ReceiveWithAuthorization naming ThenarProtocol as the payee, with a nonce
 * the protocol derives from the task's own parameters, and the relayer calls
 * createTaskWithAuthorization. The USDC moves from the sponsor to the escrow
 * in that one call; no approval, no gas, and the signature is good for this
 * task and nothing else.
 *
 * "Fund from any chain" puts Circle Gateway in front of it: the sponsor's
 * unified USDC balance on Base, Ethereum, Arbitrum and the rest is burned by a
 * signed intent and minted on Arc to the sponsor's own address, then the same
 * EIP-3009 post spends it. Two signatures, no chain switch, no gas anywhere.
 */
/**
 * Circle Gateway funding is opt-in (NEXT_PUBLIC_FEATURE_GATEWAY=1): its last
 * step, Circle's attestation of a real unified balance, can only be exercised
 * by a sponsor with one, so it is off by default and nothing else depends on it.
 */
const GATEWAY_ON = process.env.NEXT_PUBLIC_FEATURE_GATEWAY === "1";

export function GaslessPost({ draft, valid }: { draft: DraftTask; valid: boolean }) {
  const [mode, setMode] = useState<"relay" | "gateway">("relay");
  const tabs = GATEWAY_ON
    ? ([["relay", "From your Arc USDC"], ["gateway", "Fund from any chain"]] as const)
    : ([["relay", "From your Arc USDC"]] as const);

  return (
    <section className="mt-8 border border-rule" aria-labelledby="gasless-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 id="gasless-title" className="font-display text-[20px] font-600 leading-tight">Or post it without gas</h2>
        <div role="tablist" aria-label="How to fund it" className="flex gap-px bg-rule">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={cn(
                "px-3 py-1.5 font-mono text-[12px] transition-colors",
                mode === k ? "bg-scribe text-ink-0" : "bg-ink-1 text-scribe-3 hover:text-scribe",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "relay" || !GATEWAY_ON ? <RelayPanel draft={draft} valid={valid} /> : <GatewayPanel draft={draft} valid={valid} />}
    </section>
  );
}

/** Sign the EIP-3009 authorisation for this exact task and hand it to /api/relay/create-task. */
function useRelayPost() {
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  return async (funder: Address, draft: DraftTask, onStep: (k: "nonce" | "sign" | "relay", s: StepState, note?: React.ReactNode) => void) => {
    const expiresAt = draft.days > 0 ? BigInt(Math.floor(Date.now() / 1000) + draft.days * 86_400) : 0n;
    const params = {
      name: draft.name,
      slots: draft.slots,
      rewardPerTrajectory: draft.rewardPerTrajectory,
      scenario: draft.scenario,
      difficulty: draft.difficulty,
      expiresAt,
      amount: draft.amount,
    };

    onStep("nonce", "active");
    const nonce = (await client!.readContract({
      address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskNonce", args: [funder, params],
    })) as Hex;
    onStep("nonce", "done", <span className="font-mono">{shortHash(nonce)}</span>);

    onStep("sign", "active");
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await signTypedDataAsync({
      domain: { ...USDC_EIP712_DOMAIN, chainId: appChain.id, verifyingContract: USDC },
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: { from: funder, to: AXON_ADDRESS, value: draft.amount, validAfter, validBefore, nonce },
    });
    onStep("sign", "done", <>valid for an hour, for these parameters only</>);

    onStep("relay", "active");
    const r = await fetch("/api/relay/create-task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        funder,
        params: {
          name: params.name,
          slots: String(params.slots),
          rewardPerTrajectory: params.rewardPerTrajectory.toString(),
          scenario: String(params.scenario),
          difficulty: String(params.difficulty),
          expiresAt: params.expiresAt.toString(),
          amount: params.amount.toString(),
        },
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
        signature,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { transaction?: Hex; taskId?: number | string; error?: string };
    if (!r.ok || !body.transaction) {
      throw new Error(
        body.error ??
          (r.status === 404
            ? "The relayer is not running on this deployment (/api/relay/create-task answered 404). Nothing was signed away: the authorisation expires unused in an hour."
            : `The relayer answered ${r.status}. Nothing moved; the authorisation expires unused in an hour.`),
      );
    }
    onStep(
      "relay",
      "done",
      <a href={txUrl(body.transaction)} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
        {shortHash(body.transaction)}
      </a>,
    );
    return { transaction: body.transaction, taskId: body.taskId === undefined ? null : Number(body.taskId) };
  };
}

const RELAY_STEPS: Step[] = [
  {
    key: "nonce", title: "Read this task's nonce", state: "waiting",
    does: "ThenarProtocol.taskNonce hashes your address with every parameter of the task, so the signature below is good for exactly this task and cannot fund a different one.",
  },
  {
    key: "sign", title: "Sign a USDC authorisation", state: "waiting",
    does: `Your wallet signs Circle's ReceiveWithAuthorization (EIP-3009): ${CURRENCY} from you to the protocol, this amount, this nonce. A signature, not a transaction: no gas, nothing moves yet.`,
  },
  {
    key: "relay", title: "The relayer posts it", state: "waiting",
    does: "Thenar's relayer calls createTaskWithAuthorization and pays the gas in USDC. The protocol pulls the escrow from your wallet in that same call, and the task is final the moment it lands.",
  },
];

function RelayPanel({ draft, valid }: { draft: DraftTask; valid: boolean }) {
  const s = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const post = useRelayPost();
  const [steps, setSteps] = useState<Step[]>(RELAY_STEPS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ transaction: Hex; taskId: number | null } | null>(null);

  const mark = (k: string, state: StepState, note?: React.ReactNode) =>
    setSteps((xs) => xs.map((x) => (x.key === k ? { ...x, state, note } : x)));

  const go = async () => {
    if (!s.connected) return s.connect();
    if (s.wrongNetwork) return s.switchToChain();
    setBusy(true); setError(null); setPosted(null); setSteps(RELAY_STEPS);
    try {
      const out = await post(s.address as Address, draft, mark);
      setPosted(out);
      void queryClient.invalidateQueries();
      if (out.taskId !== null) setTimeout(() => router.push(`/task/${out.taskId}`), 1200);
    } catch (e) {
      setSteps((xs) => xs.map((x) => (x.state === "active" ? { ...x, state: "failed" } : x)));
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <p className="max-w-[64ch] text-[13px] leading-relaxed text-scribe-2">
        The {formatUsdc(draft.amount)} {CURRENCY} still comes from your wallet on {appChain.name}, but you sign instead of
        sending: no approval and no gas. Works {LOCALNET ? "on this fork too" : "everywhere this app runs"}.
      </p>
      <StepList steps={steps} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !valid} onClick={() => void go()} className={secondaryBtn}>
          {busy ? "Working…"
            : !valid ? "Finish the definition"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? `Switch to ${appChain.name}`
            : `Sign and post · ${formatUsdc(draft.amount)} ${CURRENCY}`}
        </button>
      </div>
      <Result error={error} posted={posted} />
    </div>
  );
}

type Balances = { address: string; total: string; balances: { domain: number; name: string; balance: string }[] };

const GATEWAY_STEPS: Step[] = [
  {
    key: "intent", title: "Sign a burn intent", state: "waiting",
    does: "An EIP-712 message to Circle's GatewayWallet: burn this much of your unified balance on the chain you picked and mint it on Arc to your own address. No gas, no chain switch.",
  },
  {
    key: "mint", title: "Circle attests, Arc mints", state: "waiting",
    does: "Thenar's server sends the signed intent to Circle's Gateway API, which answers with an attestation, then calls GatewayMinter.gatewayMint on Arc. The recipient is in what you signed, so the server cannot send it anywhere else.",
  },
  ...RELAY_STEPS,
];

function GatewayPanel({ draft, valid }: { draft: DraftTask; valid: boolean }) {
  const s = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const post = useRelayPost();
  const { signTypedDataAsync } = useSignTypedData();
  const [bal, setBal] = useState<{ for: string; data: Balances | null; error: string | null } | null>(null);
  const [domain, setDomain] = useState<number>(GATEWAY.sources[0].domain);
  const [amountText, setAmountText] = useState<string>("");
  const [steps, setSteps] = useState<Step[]>(GATEWAY_STEPS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ transaction: Hex; taskId: number | null } | null>(null);
  const [mintTx, setMintTx] = useState<Hex | null>(null);

  const address = s.address;
  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/gateway/balance?address=${address}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setBal({ for: address, data: null, error: b.error ?? `/api/gateway/balance answered ${r.status}` });
        else setBal({ for: address, data: b as Balances, error: null });
      })
      .catch((e) => live && setBal({ for: address, data: null, error: e instanceof Error ? e.message : String(e) }));
    return () => { live = false; };
  }, [address]);

  // The amount defaults to the task's escrow and follows it until edited.
  const amount = (() => {
    const t = amountText.trim() || formatUsdc(draft.amount);
    if (!/^\d*\.?\d{0,6}$/.test(t) || !/\d/.test(t)) return 0n;
    try { return parseUsdc(t); } catch { return 0n; }
  })();
  const source = GATEWAY.sources.find((x) => x.domain === domain)!;
  const here = bal?.for === address ? bal : null;
  const onSource = here?.data?.balances.find((b) => b.domain === domain);
  const fee = amount > 0n ? gatewayMaxFee(domain, amount) : 0n;
  const enough = onSource ? BigInt(onSource.balance) >= amount + fee : false;
  const covers = amount >= draft.amount;

  const mark = (k: string, state: StepState, note?: React.ReactNode) =>
    setSteps((xs) => xs.map((x) => (x.key === k ? { ...x, state, note } : x)));

  const go = async () => {
    if (!s.connected) return s.connect();
    if (s.wrongNetwork) return s.switchToChain();
    setBusy(true); setError(null); setPosted(null); setMintTx(null); setSteps(GATEWAY_STEPS);
    try {
      const me = s.address as Address;
      mark("intent", "active");
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const intent = buildBurnIntent(GATEWAY, { sourceDomain: domain, depositor: me, recipient: me, value: amount, salt });
      const signature = await signTypedDataAsync(burnIntentTypedData(intent) as unknown as Parameters<typeof signTypedDataAsync>[0]);
      mark("intent", "done", <>from {source.name}, fee at most {formatUsdc(intent.maxFee)} {CURRENCY}</>);

      mark("mint", "active");
      const r = await fetch("/api/gateway/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ burnIntent: burnIntentToJson(intent), signature }),
      });
      const b = (await r.json().catch(() => ({}))) as { transaction?: Hex; error?: string };
      if (!r.ok || !b.transaction) throw new Error(b.error ?? `/api/gateway/mint answered ${r.status}. Nothing was burned without a mint.`);
      setMintTx(b.transaction);
      mark("mint", "done", (
        <a href={txUrl(b.transaction)} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
          {shortHash(b.transaction)}
        </a>
      ));
      // Arc is final on inclusion: the minted USDC is spendable now.
      const out = await post(me, draft, mark);
      setPosted(out);
      void queryClient.invalidateQueries();
      if (out.taskId !== null) setTimeout(() => router.push(`/task/${out.taskId}`), 1500);
    } catch (e) {
      setSteps((xs) => xs.map((x) => (x.state === "active" ? { ...x, state: "failed" } : x)));
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <p className="max-w-[64ch] text-[13px] leading-relaxed text-scribe-2">
        Your USDC can sit in Circle Gateway on any chain it runs on. Gateway keeps one balance across all of them and
        mints it on Arc in about a second when you sign for it, so a sponsor whose dollars are on Base funds a bounty
        here without bridging, switching networks or holding gas.
      </p>

      {LOCALNET ? (
        <p className="mt-3 max-w-[64ch] border-l-2 border-probe pl-3 text-[13px] leading-relaxed text-scribe-2">
          <span className="text-scribe">Testnet and mainnet only.</span> This is a local fork of Arc: Circle&rsquo;s
          Gateway API attests balances on the real chains and cannot attest a mint on a fork, so the burn intent below
          can be signed but not minted here. The gasless post that follows it works on the fork &mdash; use the
          &ldquo;From your Arc USDC&rdquo; tab.
        </p>
      ) : null}

      <div className="mt-4 border border-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2">
          <span className="label">Your Gateway balance</span>
          <span className="font-mono text-[13px] tabular-nums text-signal">
            {!address ? "connect a wallet" : !here ? "reading…" : here.data ? `${formatUsdc(here.data.total)} ${CURRENCY}` : "unreadable"}
          </span>
        </div>
        {here?.error ? (
          <p className="px-4 py-3 text-[13px] text-scribe-3">Circle&rsquo;s Gateway API did not answer: {here.error}</p>
        ) : null}
        <ul role="radiogroup" aria-label="Source chain" className="grid gap-px bg-rule sm:grid-cols-2">
          {GATEWAY.sources.map((src) => {
            const b = here?.data?.balances.find((x) => x.domain === src.domain);
            const on = domain === src.domain;
            return (
              <li key={src.domain} className="bg-ink-0">
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDomain(src.domain)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left transition-colors",
                    on ? "bg-ink-2" : "hover:bg-ink-1",
                  )}
                >
                  <span className={cn("text-[13px]", on ? "text-scribe" : "text-scribe-2")}>
                    {src.name}
                    <span className="ml-2 font-mono text-[11px] text-scribe-3">domain {src.domain}</span>
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-scribe-3">{b ? formatUsdc(b.balance) : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="label">Mint on Arc</span>
        <div className="flex items-center gap-2">
          <input
            value={amountText}
            placeholder={formatUsdc(draft.amount)}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            className={cn(
              "w-[160px] border bg-ink-2 px-3 py-2 text-right font-mono text-[13px] text-scribe focus:outline-none",
              amount > 0n && amount <= GATEWAY_MAX_VALUE ? "border-rule focus:border-rule-strong" : "border-reject",
            )}
          />
          <span className="text-[12px] text-scribe-3">{CURRENCY}</span>
        </div>
        <span className="max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
          At least the escrow ({formatUsdc(draft.amount)} {CURRENCY}); at most 1,000 per transfer. Circle&rsquo;s fee comes
          out of your {source.name} balance on top, never more than {formatUsdc(fee)} {CURRENCY} for this amount.
          {!covers && amount > 0n ? <span className="text-reject"> That is less than the escrow.</span> : null}
          {here?.data && !enough && amount > 0n ? <span className="text-reject"> Your {source.name} balance is short.</span> : null}
        </span>
      </label>

      <StepList steps={steps} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !valid || LOCALNET || amount <= 0n || amount > GATEWAY_MAX_VALUE || !covers}
          onClick={() => void go()}
          className={secondaryBtn}
        >
          {busy ? "Working…"
            : LOCALNET ? "Needs Arc testnet or mainnet"
            : !valid ? "Finish the definition"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? `Switch to ${appChain.name}`
            : `Mint from ${source.name} and post`}
        </button>
        {mintTx && !posted ? (
          <span className="font-mono text-[12px] text-scribe-3">
            The mint landed; if the post failed, the USDC is in your Arc wallet. Post it from the other tab.
          </span>
        ) : null}
      </div>
      <Result error={error} posted={posted} />
    </div>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-4 border-t border-rule">
      {steps.map((st, i) => (
        <li key={st.key} className="grid grid-cols-[28px_1fr] gap-x-3 border-b border-rule py-2.5">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex size-[22px] items-center justify-center border font-mono text-[11px] tabular-nums",
              st.state === "done" ? "border-go text-go"
                : st.state === "failed" ? "border-reject text-reject"
                : st.state === "active" ? "border-scribe bg-scribe text-ink-0"
                : "border-rule-strong text-scribe-3",
            )}
          >
            {st.state === "done" ? "✓" : st.state === "failed" ? "×" : i + 1}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className={cn("text-[14px]", st.state === "waiting" ? "text-scribe-2" : "text-scribe")}>{st.title}</span>
              <span className="font-mono text-[12px] text-scribe-3">
                <span className="sr-only">{st.state}: </span>
                {st.note ?? (st.state === "active" ? "now" : null)}
              </span>
            </div>
            <p className="mt-0.5 max-w-[66ch] text-[13px] leading-relaxed text-scribe-3">{st.does}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Result({ error, posted }: { error: string | null; posted: { transaction: Hex; taskId: number | null } | null }) {
  if (error) return <p role="alert" className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-reject">{error}</p>;
  if (!posted) return null;
  return (
    <p role="status" className="mt-3 text-[13px] text-go">
      Posted without gas{posted.taskId !== null ? ` as task #${posted.taskId}` : ""} ·{" "}
      <a href={txUrl(posted.transaction)} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
        {shortHash(posted.transaction)}
      </a>
    </p>
  );
}

function explain(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|User rejected/i.test(m)) return "You did not sign, so nothing was sent and nothing moved.";
  return m.split("\n")[0];
}

const secondaryBtn =
  "border border-rule-strong bg-ink-3 px-4 py-2 text-[12px] text-scribe transition-colors hover:border-scribe disabled:cursor-not-allowed disabled:opacity-60";
