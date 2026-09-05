import { cn } from "@/lib/cn";

/**
 * The Axon mark.
 *
 * An A drawn as the thing the product actually is: two arm links rising to a
 * pivot, with the datum line crossing them where a measurement would be taken.
 * The joint is the only closed form in it, so the mark reads as a machine
 * rather than a letterform at small sizes, and it survives at 16 px because
 * every stroke is the same weight.
 */
export function AxonMark({
  className,
  title = "Axon",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-signal", className)}
      role="img"
      aria-label={title}
      fill="none"
    >
      {/* base rail — what the arm is bolted to */}
      <path d="M3 28.5h26" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" />

      {/* the two links, rising to the pivot */}
      <path
        d="M8 28.5 14.6 10.2M23.4 28.5 17.4 10.2"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />

      {/* datum line — where the measurement is taken */}
      <path d="M11.1 21.2h9.8" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" />

      {/* the pivot: the one closed form, punched out of the links */}
      <circle cx="16" cy="7.4" r="4.6" fill="var(--color-ink-0)" />
      <circle cx="16" cy="7.4" r="4.6" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="16" cy="7.4" r="1" fill="currentColor" />
    </svg>
  );
}

/** Mark plus wordmark, set in the pixel face. */
export function AxonWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AxonMark className="size-[22px] shrink-0" />
      <span className="pixel text-[15px] leading-none text-scribe">AXON</span>
    </span>
  );
}
