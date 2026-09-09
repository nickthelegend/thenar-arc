"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import { DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { fmtDate, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

const MAX_BODY = 500;

type Note = { id: string; author: string; body: string; signature: string; created_at: number };

/**
 * What operators found out about a task by driving it.
 *
 * Not a comment section. A general feed was rejected and should stay rejected —
 * commentary has nothing to do with collecting manipulation data. This is
 * narrower and does have something to do with it: "the crate lip catches the
 * screwdriver if you come in flat" is knowledge that makes the next recording
 * better, and it exists nowhere else. The contract cannot hold it and the
 * trajectory cannot express it.
 *
 * Authorship is proved, not claimed. There are no accounts here, so the byline
 * would otherwise be whatever address the poster typed. Every note is signed
 * over its own text and its own task id — checked on the server before the row
 * is written, and re-checkable by anyone from what the API returns.
 */
export function TaskNotes({ taskId }: { taskId: number }) {
  const s = useSession();
  const { signMessageAsync } = useSignMessage();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/task/${taskId}/notes`)
      .then((r) => r.json())
      .then((d: { notes: Note[] }) => setNotes(d.notes ?? []))
      .catch(() => setNotes([]));
  }, [taskId]);

  useEffect(load, [load]);

  const submit = async () => {
    const text = body.trim();
    if (!text || !s.address) return;
    setBusy(true);
    setError(null);
    try {
      // The exact bytes the server will check. Composed here rather than
      // fetched, so the wallet shows the operator the same text that ends up
      // proving they wrote it.
      const message = `Thenar note\ntask: ${taskId}\n\n${text}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch(`/api/task/${taskId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, author: s.address, signature }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "That note was not accepted.");
      setBody("");
      load();
    } catch (e) {
      setError(
        e instanceof Error && /user rejected|denied/i.test(e.message)
          ? "You did not sign, so nothing was posted."
          : e instanceof Error ? e.message : "That note was not accepted.",
      );
    } finally {
      setBusy(false);
    }
  };

  const left = MAX_BODY - body.length;

  return (
    <>
      <DimRule className="mt-10" note={`Operator notes — ${notes?.length ?? 0}`} />
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        What driving this task taught someone that the instruction does not say.
        Each note is signed by the address beside it, so the name on it is
        proved rather than typed.
      </p>

      {notes === null ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 2 }, (_, i) => <li key={i} className="hatch h-10" />)}
        </ul>
      ) : notes.length === 0 ? (
        <p className="mt-4 font-mono text-[13px] text-scribe-3">
          Nothing yet. Drive it and say what surprised you.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-1.5 border-b border-rule py-3.5">
              <p className="max-w-[70ch] text-[14px] leading-relaxed text-scribe-2">{n.body}</p>
              <span className="flex items-baseline gap-3 font-mono text-[12px] text-scribe-3">
                <a href={`/operator/${n.author}`} className="hover:text-probe">{shortHash(n.author)}</a>
                <span>{fmtDate(n.created_at)}</span>
                <span title={`Signed: ${n.signature}`} className="text-go">signed</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {s.connected ? (
        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="note" className="label">Add a note</label>
          <textarea
            id="note"
            value={body}
            maxLength={MAX_BODY}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Something the instruction does not say."
            className="w-full max-w-[62ch] resize-y border border-rule bg-ink-1 px-3 py-2 text-[14px] text-scribe placeholder:text-scribe-3 focus:border-rule-strong focus:outline-none"
          />
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className={cn(
                "border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
                busy || !body.trim()
                  ? "border-rule text-scribe-3"
                  : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
              )}
            >
              {busy ? "Waiting for your signature…" : "Sign and post"}
            </button>
            <span className={cn("font-mono text-[12px]", left < 50 ? "text-signal" : "text-scribe-3")}>
              {left} left
            </span>
          </span>
          <p className="max-w-[62ch] text-[12px] leading-relaxed text-scribe-3">
            Signing costs nothing and sends no transaction. It only proves the
            note came from your address.
          </p>
          {error ? <p className="font-mono text-[12px] text-reject">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-5 font-mono text-[13px] text-scribe-3">
          Connect a wallet to leave a note. Signing is free and sends no transaction.
        </p>
      )}
    </>
  );
}
