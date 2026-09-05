"use client";

import { useEffect } from "react";

export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[axon]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[600px] flex-col justify-center px-5 py-16">
      <span className="font-mono text-[13px] text-reject">Fault</span>
      <h1 className="mt-2 font-display text-4xl font-600 leading-none">
        This surface stopped reading.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-scribe-2">
        Something failed while rendering. Nothing on chain is affected — no
        transaction is sent by loading a page, and any run you had recorded is
        still stored under its hash.
      </p>
      <p className="mt-3 break-words font-mono text-[12px] text-scribe-3">
        {error.message}
        {error.digest ? ` · ${error.digest}` : ""}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Try again
        </button>
        <a
          href="/hub"
          className="border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
        >
          Back to the hub
        </a>
      </div>
    </div>
  );
}
