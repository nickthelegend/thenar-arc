import type { Metadata } from "next";
import { DimRule } from "@/components/primitives";
import entries from "@/lib/changelog.json";

export const metadata: Metadata = {
  title: "Changelog — Thenar",
  description: "Every change to this project, from its own git history.",
};

type Entry = { hash: string; date: string; subject: string; body: string };

/**
 * What changed, from the history rather than from a summary of it.
 *
 * Written by generating from `git log` at build time, so it cannot drift from
 * what was actually done — a hand-kept changelog is a second account of the
 * work that quietly stops matching the first. Each entry keeps its commit hash,
 * so anything here can be checked against the repository.
 */
export default function ChangelogPage() {
  const log = entries as Entry[];

  return (
    <div className="mx-auto max-w-[820px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Changelog</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Generated from this project&rsquo;s own git history at build time, not
        written alongside it. A changelog kept by hand is a second account of the
        work that quietly stops matching the first; this one cannot, and every
        entry carries the commit it came from.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <span className="flex items-baseline gap-2">
          <span className="label">Entries</span>
          <span className="font-mono text-[15px] tabular-nums text-scribe">{log.length}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">Most recent</span>
          <span className="font-mono text-[15px] text-scribe-2">
            {log[0] ? new Date(log[0].date).toLocaleDateString() : "—"}
          </span>
        </span>
      </div>

      <DimRule className="mt-6" note="Newest first" />

      <ol className="mt-4 flex flex-col">
        {log.map((e) => (
          <li key={e.hash} className="flex flex-col gap-2 border-b border-rule py-4">
            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[15px] leading-snug text-scribe">{e.subject}</span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-scribe-3">
                {new Date(e.date).toLocaleDateString()} · {e.hash}
              </span>
            </span>
            {e.body ? (
              <p className="max-w-[70ch] whitespace-pre-line text-[13px] leading-relaxed text-scribe-3">
                {e.body}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
