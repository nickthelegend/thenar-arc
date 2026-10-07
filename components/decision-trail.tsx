"use client";

import { useEffect, useState } from "react";
import { recoverMessageAddress, type Hex } from "viem";
import { decisionMessage, type DecisionRecord } from "@/lib/agent-decision";
import { AGENT_CORPUS } from "@/lib/agent-corpus";
import { cn } from "@/lib/cn";

/**
 * One agent purchase, as the agent itself accounts for it: the model that
 * decided, every tool it called in order and what came back, its own report,
 * and its check of the file against SalesLog.
 *
 * The record is the agent's, signed with the key that paid. The server checked
 * that before keeping it; this page checks it again, so what is on screen does
 * not rest on the server's word either.
 */

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
const units = (atomic: string) => `${Number(atomic) / 10 ** AGENT_CORPUS.decimals} ${AGENT_CORPUS.symbol}`;

type Check = "checking" | "valid" | "invalid";

export function DecisionTrail({ id, record, signature, open }: { id: string; record: DecisionRecord; signature: Hex; open?: boolean }) {
  const [check, setCheck] = useState<Check>("checking");
  useEffect(() => {
    let live = true;
    recoverMessageAddress({ message: decisionMessage(record), signature })
      .then((a) => { if (live) setCheck(a.toLowerCase() === record.buyer.toLowerCase() ? "valid" : "invalid"); })
      .catch(() => { if (live) setCheck("invalid"); });
    return () => { live = false; };
  }, [record, signature]);

  const t0 = record.steps[0]?.at ?? record.at;
  const v = record.verified;

  return (
    <details id={`why-${id}`} open={open} className="group border border-rule bg-ink-1" data-testid="decision-trail" data-check={check}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-ink-2">
        <span className="text-[14px] text-scribe">
          Task #{record.sale.taskId} <span className="text-scribe-3">bought by</span>{" "}
          <span className="font-mono text-[13px]">{short(record.buyer)}</span>{" "}
          <span className="text-scribe-3">with</span> {record.model.name}
        </span>
        <span className={cn("font-mono text-[12px]", check === "valid" ? "text-go" : check === "invalid" ? "text-reject" : "text-scribe-3")}>
          {check === "valid" ? "signed by the key that paid ✓" : check === "invalid" ? "signature does not match the buyer" : "checking the signature…"}
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-rule px-4 py-4 text-[13px]">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
          <dt className="text-scribe-3">Model</dt>
          <dd className="text-scribe-2 [overflow-wrap:anywhere]">
            {record.model.name} · {record.model.provider} · {record.model.where}
            {/* A hosted provider reached through an overridden endpoint is a stand-in, and says so. */}
            {/_BASE_URL names/.test(record.model.where) ? (
              <span className="mt-0.5 block text-[12px] text-scribe-3">
                The endpoint was overridden, so this is not {record.model.provider === "kimi" ? "Moonshot" : "Model Studio"} itself: in this repository&rsquo;s tests it is the scripted double in test/llm-double.mjs.
              </span>
            ) : null}
          </dd>
          <dt className="text-scribe-3">Asked to</dt>
          <dd className="text-scribe-2 [overflow-wrap:anywhere]">{record.goal}</dd>
          <dt className="text-scribe-3">Spent</dt>
          <dd className="font-mono text-scribe-2">{units(record.spent)} of a {units(record.budget)} budget the code enforced</dd>
        </dl>

        <ol className="flex flex-col gap-2" aria-label="The tools the agent called, in order">
          {record.steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-x-3">
              <span className="font-mono text-[12px] tabular-nums text-scribe-3">+{((s.at - t0) / 1000).toFixed(1)}s</span>
              <span className="min-w-0">
                <span className="font-mono text-signal">{s.tool}</span>
                <span className="font-mono text-scribe-3">({Object.keys(s.args).length ? JSON.stringify(s.args) : ""})</span>
                <span className="mt-0.5 block font-mono text-[12px] leading-relaxed text-scribe-3 [overflow-wrap:anywhere]">→ {s.result}</span>
              </span>
            </li>
          ))}
        </ol>

        {record.report ? (
          <blockquote className="border-l-0 bg-ink-2 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-scribe-2 [overflow-wrap:anywhere]">
            <span className="mb-1 block text-[12px] text-scribe-3">The model&rsquo;s report</span>
            {record.report}
          </blockquote>
        ) : null}

        <p className={cn("font-mono text-[12px] [overflow-wrap:anywhere]", v?.matches ? "text-go" : v ? "text-reject" : "text-scribe-3")}>
          {v
            ? v.matches
              ? `Checked on chain: the sha256 of its copy, ${short(v.sha256)}, is what SalesLog entry #${v.entry} records as sold.`
              : `Checked on chain, and it did not match: its copy hashes to ${short(v.sha256)}.`
            : "The agent did not check this purchase against SalesLog."}
        </p>
      </div>
    </details>
  );
}
