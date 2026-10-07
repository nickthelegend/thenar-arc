"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Hex } from "viem";
import { DimRule } from "@/components/primitives";
import { AGENT_CORPUS, agentCorpusPrice, explorerAddress } from "@/lib/agent-corpus";
import { readableError } from "@/lib/fetch-error";
import { LOCALNET } from "@/lib/chain";
import type { DecisionRecord } from "@/lib/agent-decision";
import { DecisionTrail } from "@/components/decision-trail";

/**
 * Where an agent buys the corpus, and every pull an agent has taken.
 *
 * The corpus page is for a person deciding whether to licence the data. This
 * one is for the program that fetches it: the terms it is offered in a 402,
 * what a given agent has bought, and the ledger of
 * what agents have actually taken — each paid pull linked to the Monad
 * transaction that settled it, and each pull linked to the SalesLog entry that
 * recorded the hash of what it received.
 */

type Audit =
  | { contract: string; sequence: number; sha256: string | null; transaction: string | null; url: string }
  | { error: string | null; sha256: string }
  | null;
type Sale = {
  id: string; task_id: number; method: "x402" | "agentkit"; buyer: string | null;
  network: string; amount: string | null; asset: string | null; created_at: number;
  proof: string | null; audit: Audit;
  decision: { record: DecisionRecord; signature: Hex } | null;
};
type Sales = { terms: { payTo: string | null; salesLog: string | null; salesLogUrl: string | null }; count: number; sales: Sale[] };
type Status =
  | { address: string; purchases: number; tasks: number[]; sales: { taskId: number; at: number; transaction: string; sha256: string | null }[] }
  | { error: string };

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const usdc = (atomic: string) => `${Number(atomic) / 10 ** AGENT_CORPUS.decimals} ${AGENT_CORPUS.symbol}`;

/** This page's own origin, for the commands below; the prerendered page knows only the configured one. */
const noop = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(noop, () => location.origin, () => process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://app.thenar.io");

export default function AgentsPage() {
  const here = useOrigin();
  const [sales, setSales] = useState<Sales | { error: string } | null>(null);
  const [address, setAddress] = useState<string>(AGENT_CORPUS.demoAgent);
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/agent/sales")
      .then(async (r) => {
        const body = await r.json();
        if (live) setSales(r.ok ? body : { error: body.error ?? `the ledger answered ${r.status}` });
      })
      .catch((e) => live && setSales({ error: readableError(e) }));
    return () => { live = false; };
  }, []);

  async function check() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setStatus({ error: "That is not a wallet address. It should be 0x followed by 40 hexadecimal characters." });
      return;
    }
    setChecking(true);
    try {
      const r = await fetch(`/api/agent/status?address=${encodeURIComponent(address.trim())}`);
      setStatus(await r.json());
    } catch (e) {
      setStatus({ error: readableError(e) });
    } finally {
      setChecking(false);
    }
  }

  const terms = sales && "terms" in sales ? sales.terms : null;

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none">Agents</h1>
      <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        An agent can take one task&apos;s corpus without a subscription. It asks for the file, is
        answered <span className="font-mono text-[13px]">402</span>, and pays {agentCorpusPrice()} on
        {LOCALNET ? "the local chain" : "Monad"} in the request that fetches it, final about 600 ms after it lands on Monad. No account, no API key
        and no subscription: the payment is the permission.
      </p>

      <DimRule className="mt-10" note="The terms, as the 402 states them" />
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2 text-[14px]">
        <dt className="text-[12px] text-scribe-3">Endpoint</dt>
        <dd className="font-mono text-[13px] text-scribe">GET {AGENT_CORPUS.path}?taskId=N</dd>

        <dt className="text-[12px] text-scribe-3">Price</dt>
        <dd className="text-scribe">{agentCorpusPrice()} per task corpus, x402 exact scheme</dd>

        <dt className="text-[12px] text-scribe-3">Settles</dt>
        <dd className="text-scribe-2">
          On <span className="font-mono text-[13px]">{AGENT_CORPUS.network}</span>, through{" "}
          {LOCALNET ? (
            <>
              the x402 facilitator running on this machine (<span className="font-mono text-[13px]">{AGENT_CORPUS.facilitator}</span>);
              on Monad it is{" "}
              <a href="https://x402-facilitator.molandak.org/supported" target="_blank" rel="noreferrer" className="text-signal hover:text-signal-hi">
                Monad&apos;s own facilitator
              </a>
            </>
          ) : (
            <a href={AGENT_CORPUS.facilitator + "/supported"} target="_blank" rel="noreferrer" className="text-signal hover:text-signal-hi">
              Monad&apos;s x402 facilitator
            </a>
          )}
          , which submits the agent&apos;s signed USDC authorisation and pays the gas. Only after the file is ready: a task with
          nothing recorded answers 404 and charges nothing.
        </dd>

        <dt className="text-[12px] text-scribe-3">Paid to</dt>
        <dd>
          {terms?.payTo ? (
            <a href={explorerAddress(terms.payTo)} target="_blank" rel="noreferrer" className="break-all font-mono text-[13px] text-signal hover:text-signal-hi">
              {terms.payTo} &rarr;
            </a>
          ) : (
            <span className="text-scribe-3">{sales ? "no treasury configured" : "reading…"}</span>
          )}
        </dd>

        <dt className="text-[12px] text-scribe-3">Sales log</dt>
        <dd className="text-scribe-2">
          {terms?.salesLog && terms.salesLogUrl ? (
            <>
              <a href={terms.salesLogUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-[13px] text-signal hover:text-signal-hi">
                SalesLog {short(terms.salesLog)}
              </a>
              {" "}— a contract only the seller can write to. Every pull is logged there with the sha256 of
              the file served, in storage as well as in an event, so a buyer can hash its copy and ask the
              contract&apos;s <span className="font-mono text-[13px]">servedCount</span> whether it was sold.
            </>
          ) : (
            <span className="text-scribe-3">{sales ? "no SalesLog deployed" : "reading…"}</span>
          )}
        </dd>

      </dl>

      <DimRule className="mt-10" note="What has this agent bought?" />
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={(e) => { e.preventDefault(); void check(); }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
          aria-label="Agent wallet address"
          className="min-w-0 flex-1 border border-scribe-3 bg-transparent px-3 py-2 font-mono text-[13px] text-scribe outline-none focus:border-signal"
        />
        <button
          type="submit"
          disabled={checking || address.trim() === ""}
          className="border border-scribe bg-scribe px-4 py-2 text-[12px] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
        >
          {checking ? "Reading the ledger…" : "Look it up"}
        </button>
      </form>
      {status ? (
        "error" in status ? (
          <p className="mt-3 text-[14px] text-reject">{status.error}</p>
        ) : status.purchases === 0 ? (
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
            <span className="text-scribe">Nothing yet.</span> This wallet has not bought a corpus from this deployment.
          </p>
        ) : (
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
            <span className="text-go">{status.purchases} {status.purchases === 1 ? "purchase" : "purchases"}</span>, of task
            {status.tasks.length === 1 ? "" : "s"} {status.tasks.map((t) => `#${t}`).join(", ")}. Each one is in the ledger below with the
            hash of the file it received.
          </p>
        )
      ) : null}

      <DimRule className="mt-10" note="What agents have taken" />
      {!sales ? (
        <p className="mt-4 text-[14px] text-scribe-3">Reading the ledger…</p>
      ) : "error" in sales ? (
        <p className="mt-4 text-[14px] text-reject">{sales.error}</p>
      ) : sales.sales.length === 0 ? (
        <p className="mt-4 max-w-[64ch] text-[14px] text-scribe-2">
          No agent has taken a corpus from this deployment yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] text-scribe-3">
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 font-normal">Task</th>
                <th className="py-2 pr-4 font-normal">Terms</th>
                <th className="py-2 pr-4 font-normal">Buyer</th>
                <th className="py-2 pr-4 font-normal">Settlement</th>
                <th className="py-2 pr-4 font-normal">Logged</th>
                <th className="py-2 font-normal">Why</th>
              </tr>
            </thead>
            <tbody>
              {sales.sales.map((s) => (
                <tr key={s.id} className="border-t border-scribe-3/40">
                  <td className="py-2 pr-4 text-scribe-2">{when(s.created_at)}</td>
                  <td className="py-2 pr-4 font-mono text-scribe">#{s.task_id}</td>
                  <td className="py-2 pr-4">
                    {s.method === "x402" && s.amount ? (
                      <span className="text-signal">paid {usdc(s.amount)}</span>
                    ) : (
                      <span className="text-scribe-3">free pull (before x402-only)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-scribe-2">{s.buyer ? short(s.buyer) : "—"}</td>
                  <td className="py-2 pr-4">
                    {s.proof ? (
                      <a href={s.proof} target="_blank" rel="noreferrer" className="font-mono text-signal hover:text-signal-hi">
                        {short(s.id)} &rarr;
                      </a>
                    ) : (
                      <span className="text-scribe-3">nothing moved</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {s.audit && "contract" in s.audit ? (
                      <a href={s.audit.url} target="_blank" rel="noreferrer" title={s.audit.sha256 ?? undefined} className="font-mono text-signal hover:text-signal-hi">
                        #{s.audit.sequence} &rarr;
                      </a>
                    ) : s.audit ? (
                      <span className="text-reject" title={s.audit.error ?? undefined}>not logged</span>
                    ) : (
                      <span className="text-scribe-3">before the log</span>
                    )}
                  </td>
                  <td className="py-2">
                    {s.decision ? (
                      <a href={`#why-${s.id}`} className="text-signal hover:text-signal-hi">signed trail &darr;</a>
                    ) : (
                      <span className="text-scribe-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DimRule className="mt-10" note="Why agents bought" />
      {sales && "sales" in sales && sales.sales.some((s) => s.decision) ? (
        <div className="mt-4 flex flex-col gap-3" data-testid="decision-trails">
          <p className="max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
            Each purchase below comes with the agent&apos;s own account of it, signed with the key that paid: the model
            that decided, every tool it called and what came back, and its check of the file against SalesLog. The server
            keeps one only from the sale&apos;s buyer, and this page checks the signature again.
          </p>
          {sales.sales.filter((s) => s.decision).map((s, i) => (
            <DecisionTrail key={s.id} id={s.id} record={s.decision!.record} signature={s.decision!.signature} open={i === 0} />
          ))}
        </div>
      ) : (
        <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
          {sales ? "No agent has published the reasons for a purchase yet. The language-model agent below does after every one." : "Reading the ledger…"}
        </p>
      )}

      <DimRule className="mt-10" note="Run the buyer" />
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        The agent in the repository reads the tasks and their datasheets, decides what to buy within a budget its code
        enforces, pays over x402, hashes what it received and asks SalesLog whether those exact bytes were logged as sold.
        Then it signs its account of all of that and publishes it here. Qwen on Model Studio, Kimi on Moonshot, or Qwen 3
        on this machine through Ollama:
      </p>
      <pre className="mt-3 overflow-x-auto border border-scribe-3 px-3 py-2 font-mono text-[12px] text-scribe">
        AGENT_LLM=ollama node --import ./test/register.mjs scripts/qwen-agent.mjs {here}
      </pre>
      <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        Without a model, the plain buyer pays and verifies the same way:{" "}
        <span className="font-mono text-[12px] text-scribe-2">node --import ./test/register.mjs scripts/agent-buy.mjs {here} 1</span>
      </p>
    </div>
  );
}
