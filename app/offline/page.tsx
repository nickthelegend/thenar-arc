import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline — Thenar",
  description: "The network is gone. Nothing shown here would be current.",
};

/**
 * What the app opens to when the network is gone.
 *
 * Deliberately empty of figures. Every number on this site is read from a
 * contract or a ledger, and showing the last one anybody saw would be showing
 * a number that was true once — which, on a site whose claim is that you can
 * check the numbers, is worse than showing none.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-[62ch] px-5 py-24">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">
        No network
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-scribe-2">
        The app opened, which is all it can do from here. Every figure Thenar
        shows &mdash; escrow, scores, payouts, standings &mdash; is read from the
        contract when you look at it, so there is nothing to show you that would
        still be true.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-scribe-3">
        A run you had already measured is not lost: it is held in this browser
        until you submit it, and the station will offer it back when you return.
      </p>
      <Link
        href="/hub"
        className="mt-8 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] hover:border-signal hover:text-signal"
      >
        Try again
      </Link>
    </div>
  );
}
