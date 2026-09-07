"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * A failure here should not take the rest of the app with it.
 *
 * The root boundary catches everything, which means one broken surface blanks
 * the whole page and loses the navigation with it. This one keeps the operator
 * where they are, says what failed, and offers the two things worth doing —
 * retry, or leave.
 */
export default function SurfaceError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Reaches the browser console and any collector attached to it, rather than
    // being swallowed by the boundary that rendered this.
    console.error("[thenar/run]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] px-5 py-24 text-center">
      <h1 className="font-display text-3xl font-600">This surface stopped reading</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-scribe-2">
        Something in the run view failed. Nothing on chain is affected — no run
        is recorded and no payment is made by a page that did not render.
      </p>
      <p className="mt-3 break-words font-mono text-[12px] text-scribe-3">
        {error.message || "no message"}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Try again
        </button>
        <Link
          href="/hub"
          className="border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
        >
          Back to the hub
        </Link>
      </div>
    </div>
  );
}
