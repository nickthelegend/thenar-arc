import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[560px] flex-col justify-center px-5 py-16">
      <span className="font-mono text-[13px] text-scribe-3">404</span>
      <h1 className="mt-2 font-display text-4xl font-600 leading-none">
        Nothing is measured here.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-scribe-2">
        That address is not part of the foundry. The work is on the hub — tasks,
        slots, and what each accepted run pays.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/hub"
          className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Open the hub
        </Link>
        <Link
          href="/"
          className="border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
        >
          Back to the start
        </Link>
      </div>
    </div>
  );
}
