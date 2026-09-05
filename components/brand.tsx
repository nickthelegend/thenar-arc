import { cn } from "@/lib/cn";

/**
 * The Thenar mark.
 *
 * The thenar is the muscle at the base of the thumb — the one that makes a
 * hand able to oppose and grip at all. So the mark is a gripper on a post:
 * two opposed jaws on a yoke, with the datum line crossing them where a
 * measurement would be taken. The pivot is the only closed form in it, so the
 * mark reads as a machine rather than a letterform at small sizes, and it
 * survives at 16 px because every stroke is the same weight.
 */
export function ThenarMark({
  className,
  title = "Thenar",
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

      {/* the post, rising to the pivot */}
      <path d="M16 28.5V19.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="butt" />

      {/* the yoke and the two opposed jaws */}
      <path d="M9.6 11.2h12.8" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" />
      <path
        d="M9.6 11.2V4.8M22.4 11.2V4.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="butt"
      />

      {/* datum line — where the measurement is taken */}
      <path d="M13 7.6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" />

      {/* the pivot: the one closed form, punched out of the post */}
      <circle cx="16" cy="15.4" r="4.2" fill="var(--color-ink-0)" />
      <circle cx="16" cy="15.4" r="4.2" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="16" cy="15.4" r="1" fill="currentColor" />
    </svg>
  );
}

/** Mark plus wordmark, set in the pixel face. */
export function ThenarWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <ThenarMark className="size-[22px] shrink-0" />
      <span className="pixel text-[15px] leading-none text-scribe">THENAR</span>
    </span>
  );
}
