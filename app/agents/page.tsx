"use client";

import { useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { AGENT_CORPUS, agentCorpusPrice } from "@/lib/agent-corpus";

/**
 * Where an agent buys the corpus, and every pull an agent has taken.
 *
 * The corpus page is for a person deciding whether to licence the data. This
 * one is for the program that fetches it: the terms it is offered in a 402,
 * whether World's AgentBook says a human stands behind it, and the ledger of
 * what agents have actually taken — each paid pull linked to the Hedera
 * transaction that settled it, and each pull linked to the message on the sales
 * topic that logged the hash of what it received.
 */

type Audit =
  | { topic: string; sequence: number; sha256: string | null; message: string }
  | { error: string | null; sha256: string }
  | null;
type Sale = {
  id: string; task_id: number; method: "x402" | "agentkit"; buyer: string | null;
  network: string; amount: string | null; asset: string | null; created_at: number;
  proof: string | null; audit: Audit;
};
type Sales = { terms: { payTo: string | null; salesTopic: string | null }; count: number; sales: Sale[] };
type Status =
  | { address: string; registered: boolean; humanId: string | null; freePulls: { used: number; of: number } | null; register: string }
  | { error: string };

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const hbar = (tinybars: string) => `${Number(tinybars) / 10 ** AGENT_CORPUS.decimals} HBAR`;

export default function AgentsPage() {
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
      .catch((e) => live && setSales({ error: String(e) }));
    return () => { live = false; };
  }, []);

  async function check() {
    setChecking(true);
    try {
      const r = await fetch(`/api/agent/status?address=${encodeURIComponent(address.trim())}`);
      setStatus(await r.json());
    } catch (e) {
      setStatus({ error: String(e) });
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
        Hedera in the request that fetches it. If World&apos;s AgentBook maps its wallet to a verified
        human, its first {AGENT_CORPUS.freeUses} pulls are free instead. An agent with nobody behind it
        is not refused. It pays.
      </p>

      <DimRule className="mt-10" note="The terms, as the 402 states them" />
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2 text-[14px]">
        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Endpoint</dt>
        <dd className="font-mono text-[13px] text-scribe">GET {AGENT_CORPUS.path}?taskId=N</dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Price</dt>
        <dd className="text-scribe">{agentCorpusPrice()} per task corpus, x402 exact scheme</dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Settles</dt>
        <dd className="text-scribe-2">
          On <span className="font-mono text-[13px]">{AGENT_CORPUS.network}</span>, through{" "}
          <a href={AGENT_CORPUS.facilitator + "/supported"} target="_blank" rel="noreferrer" className="text-signal hover:text-signal-hi">
            Blocky402
          </a>
          , which submits the transfer and pays its fee. Only after the file is ready: a task with
          nothing recorded answers 404 and charges nothing.
        </dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Paid to</dt>
        <dd>
          {terms?.payTo ? (
            <a href={`${AGENT_CORPUS.hashscan}/account/${terms.payTo}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-signal hover:text-signal-hi">
              {terms.payTo} &rarr;
            </a>
          ) : (
            <span className="text-scribe-3">{sales ? "no treasury configured" : "reading…"}</span>
          )}
        </dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Sales log</dt>
        <dd className="text-scribe-2">
          {terms?.salesTopic ? (
            <>
              <a href={`${AGENT_CORPUS.hashscan}/topic/${terms.salesTopic}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-signal hover:text-signal-hi">
                {terms.salesTopic}
              </a>
              {" "}— a Consensus Service topic only the treasury can post to. Every pull is logged there with
              the sha256 of the file served, so a buyer can check its copy against a record this server
              cannot rewrite.
            </>
          ) : (
            <span className="text-scribe-3">{sales ? "no sales topic configured" : "reading…"}</span>
          )}
        </dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Free pulls</dt>
        <dd className="text-scribe-2">
          {AGENT_CORPUS.freeUses} per verified human, counted across every task and kept in the database,
          so a restart does not hand them out again
        </dd>

        <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">Human check</dt>
        <dd className="text-scribe-2">
          AgentBook{" "}
          <a href={`https://worldscan.org/address/${AGENT_CORPUS.agentBook.address}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-signal hover:text-signal-hi">
            {short(AGENT_CORPUS.agentBook.address)}
          </a>{" "}
          on World Chain, read at the moment of the request
        </dd>
      </dl>

      <DimRule className="mt-10" note="Is a human behind this agent?" />
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
          disabled={checking}
          className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
        >
          {checking ? "Asking World Chain…" : "Look it up"}
        </button>
      </form>
      {status ? (
        "error" in status ? (
          <p className="mt-3 text-[14px] text-reject">{status.error}</p>
        ) : status.registered ? (
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
            <span className="text-go">Human-backed.</span> AgentBook maps this wallet to an anonymous
            human id. Free pulls used: {status.freePulls?.used} of {status.freePulls?.of}; after that it pays
            like anyone else.
          </p>
        ) : (
          <div className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
            <p>
              <span className="text-scribe">Not in AgentBook.</span> The paywall will ask this agent to pay.
              A person can vouch for it with World App:
            </p>
            <pre className="mt-2 overflow-x-auto border border-scribe-3 px-3 py-2 font-mono text-[12px] text-scribe">{status.register}</pre>
          </div>
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
              <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-scribe-3">
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 font-normal">Task</th>
                <th className="py-2 pr-4 font-normal">Terms</th>
                <th className="py-2 pr-4 font-normal">Buyer</th>
                <th className="py-2 pr-4 font-normal">Settlement</th>
                <th className="py-2 font-normal">Logged</th>
              </tr>
            </thead>
            <tbody>
              {sales.sales.map((s) => (
                <tr key={s.id} className="border-t border-scribe-3/40">
                  <td className="py-2 pr-4 text-scribe-2">{when(s.created_at)}</td>
                  <td className="py-2 pr-4 font-mono text-scribe">#{s.task_id}</td>
                  <td className="py-2 pr-4">
                    {s.method === "x402" && s.amount ? (
                      <span className="text-signal">paid {hbar(s.amount)}</span>
                    ) : (
                      <span className="text-go">free, human-backed</span>
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
                  <td className="py-2">
                    {s.audit && "topic" in s.audit ? (
                      <a href={s.audit.message} target="_blank" rel="noreferrer" title={s.audit.sha256 ?? undefined} className="font-mono text-signal hover:text-signal-hi">
                        #{s.audit.sequence} &rarr;
                      </a>
                    ) : s.audit ? (
                      <span className="text-reject" title={s.audit.error ?? undefined}>not logged</span>
                    ) : (
                      <span className="text-scribe-3">before the log</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DimRule className="mt-10" note="Run the buyer" />
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        The agent in the repository signs AgentKit&apos;s challenge with its wallet and, when that does not
        earn a free pull, pays from a Hedera account created with the same key. Then it hashes what it
        received and checks the sales topic on Hedera&apos;s mirror node for the same hash.
      </p>
      <pre className="mt-3 overflow-x-auto border border-scribe-3 px-3 py-2 font-mono text-[12px] text-scribe">
        node scripts/agent-buy.mjs http://localhost:3222 1
      </pre>
    </div>
  );
}
