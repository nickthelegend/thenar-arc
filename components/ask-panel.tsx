"use client";

import { useState } from "react";
import { ask, askable, type Answer } from "@/lib/ask";
import { cn } from "@/lib/cn";

/**
 * Ask the instrument.
 *
 * A chatbot was rejected because nothing here needs conversation, and that is
 * still true — so this is not one. It answers from the constants the scorer
 * actually uses and names where each figure came from, and a question it
 * cannot answer exactly is refused rather than approximated.
 *
 * The questions it can answer are listed rather than hidden behind a prompt.
 * A box that invites anything and answers a tenth of it wastes more of
 * someone's time than a short list they can read.
 */
export function AskPanel() {
  const [q, setQ] = useState("");
  const [a, setA] = useState<Answer | null>(null);
  const [missed, setMissed] = useState(false);

  const submit = (text: string) => {
    setQ(text);
    const hit = ask(text);
    setA(hit);
    setMissed(!hit && text.trim().length >= 3);
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(q); }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Why did my run pay nothing?"
          aria-label="Ask about how this works"
          className="min-w-0 flex-1 border border-rule bg-ink-1 px-3 py-2 font-mono text-[13px] text-scribe placeholder:text-scribe-3 focus:border-rule-strong focus:outline-none"
        />
        <button
          type="submit"
          className="border border-rule-strong px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-scribe hover:border-signal hover:text-signal"
        >
          Ask
        </button>
      </form>

      {a ? (
        <div className="flex flex-col gap-2 border border-rule bg-ink-1 px-4 py-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">{a.question}</span>
          <p className="max-w-[70ch] text-[14px] leading-relaxed text-scribe-2">{a.answer}</p>
          <p className="font-mono text-[12px] text-scribe-3">Read from: {a.source}</p>
        </div>
      ) : null}

      {missed ? (
        <p className="font-mono text-[13px] text-scribe-3">
          No exact answer to that one. Everything below is answered from the
          system itself rather than guessed, which is why the list is short.
        </p>
      ) : null}

      <ul className="flex flex-wrap gap-1.5">
        {askable().map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => submit(question)}
              className={cn(
                "border px-2 py-1 text-left text-[12px] transition-colors",
                a?.question === question
                  ? "border-signal text-signal"
                  : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
              )}
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
