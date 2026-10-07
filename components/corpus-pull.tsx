"use client";

import { useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import { usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import { useSession } from "@/components/session";
import { AGENT_CORPUS, agentCorpusPrice, explorerTx } from "@/lib/agent-corpus";
import { USDC_FAUCET_URL, appChain } from "@/lib/chain";
import { shortHash } from "@/lib/format";

type Bought = { name: string; kb: number; tx: string | null; sha256: string | null; audit: string | null };

/**
 * One task's corpus, bought from this page the way an agent buys it.
 *
 * The same x402 offer /api/agent/corpus makes to an agent: a cent of USDC, as
 * an EIP-3009 authorisation the wallet signs and the facilitator settles on
 * Monad, paying the gas itself. Here the signer is the operator's own wallet,
 * the embedded one Privy made at sign-in, so a person needs no MON and no
 * subscription to take one file. The sale is recorded and logged to SalesLog
 * like any other, and the file's SHA-256 is the one the log holds.
 */
export function CorpusPull({ taskId }: { taskId: number }) {
  const s = useSession();
  const client = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<Bought | null>(null);

  const usdc = useReadContract({
    address: AGENT_CORPUS.asset as `0x${string}`, abi: erc20Abi, functionName: "balanceOf",
    args: s.address ? [s.address] : undefined, query: { enabled: Boolean(s.address) },
  });
  const held = usdc.data as bigint | undefined;
  const short = held !== undefined && held < BigInt(AGENT_CORPUS.amount);

  const buy = async () => {
    if (!s.address) return;
    setBusy(true); setError(null); setBought(null);
    try {
      const [{ x402Client, wrapFetchWithPayment, decodePaymentResponseHeader }, { ExactEvmScheme }, { toClientEvmSigner }] =
        await Promise.all([import("@x402/fetch"), import("@x402/evm/exact/client"), import("@x402/evm")]);
      const address = s.address;
      const signer = toClientEvmSigner(
        { address, signTypedData: (m) => signTypedDataAsync(m as Parameters<typeof signTypedDataAsync>[0]) },
        client as never,
      );
      const payer = x402Client.fromConfig({
        schemes: [{ network: AGENT_CORPUS.network, client: new ExactEvmScheme(signer) }],
        // Monad testnet USDC is not one of x402's default assets. Allowed here,
        // and never for more than the price this page states.
        spendControls: {
          allowedAssets: [{ network: AGENT_CORPUS.network, asset: AGENT_CORPUS.asset, maxAmountPerPayment: AGENT_CORPUS.amount }],
        },
      });
      const res = await wrapFetchWithPayment(fetch, payer)(
        `${location.origin}${AGENT_CORPUS.path}?taskId=${taskId}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? (res.status === 402 ? "The payment was not accepted. Nothing was charged." : `The server answered ${res.status}.`));
      }
      const receipt = res.headers.get("PAYMENT-RESPONSE");
      const settled = receipt ? decodePaymentResponseHeader(receipt) : null;
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `thenar-task-${taskId}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setBought({
        name, kb: blob.size / 1024,
        tx: settled?.transaction ?? null,
        sha256: res.headers.get("x-thenar-sha256"),
        audit: res.headers.get("x-thenar-audit"),
      });
      void usdc.refetch();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(/reject|denied|User rejected/i.test(m) ? "You did not sign, so nothing was paid." : m.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border border-rule bg-ink-1 px-5 py-4" data-testid="corpus-pull">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Just this task</span>
        <span className="font-mono text-[13px] text-scribe-2">{agentCorpusPrice()} per download, over x402</span>
        {s.connected && held !== undefined ? (
          <span className={`font-mono text-[13px] ${short ? "text-scribe-3" : "text-signal"}`}>
            this wallet holds {formatUnits(held, AGENT_CORPUS.decimals)} {AGENT_CORPUS.symbol}
          </span>
        ) : null}
      </div>
      <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-scribe-2">
        No subscription. Your wallet signs a one-cent USDC authorisation, the facilitator settles it on{" "}
        {appChain.name} and pays the gas, and task #{taskId}&rsquo;s corpus downloads. It is the same sale an agent
        makes, logged on chain with the file&rsquo;s hash.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || (s.connected && short)}
          onClick={() => (!s.connected ? s.connect() : s.wrongNetwork ? s.switchToChain() : void buy())}
          className="border border-rule-strong px-4 py-2 text-[12px] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
        >
          {busy ? "Sign in your wallet…"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? `Switch to ${appChain.name}`
            : `Buy task #${taskId} for ${agentCorpusPrice()}`}
        </button>
        {s.connected && short ? (
          <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="text-[13px] text-probe hover:underline">
            Get test USDC →
          </a>
        ) : null}
      </div>
      {bought ? (
        <div className="mt-3 space-y-1 font-mono text-[12px]" role="status">
          <p className="text-go">Paid and saved {bought.name}, {bought.kb.toFixed(0)} KB.</p>
          {bought.tx ? (
            <p className="text-scribe-3">
              settlement{" "}
              <a href={explorerTx(bought.tx)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                {shortHash(bought.tx)}
              </a>
            </p>
          ) : null}
          {bought.sha256 ? <p className="text-scribe-3">sha256 {shortHash(`0x${bought.sha256}`)}</p> : null}
          {bought.audit ? <p className="text-scribe-3">SalesLog {bought.audit}</p> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[13px] text-reject">{error}</p> : null}
    </div>
  );
}
