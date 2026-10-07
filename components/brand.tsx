import { cn } from "@/lib/cn";

/**
 * The ThenarLabs mark.
 *
 * The thenar is the muscle at the base of the thumb: the one that lets a hand
 * grip. So the mark is a grip: two opposed gripper jaws, cut from the halves
 * of a hexagon, cradling a crescent that is the palm. One stroke weight, so
 * it holds at 16 px.
 */
export function ThenarMark({
  className,
  title = "ThenarLabs",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={cn("text-white", className)} role="img" aria-label={title}>
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round">
        <path d="M26.5 6.5 L11 19.5 V44.5 L26.5 57.5" />
        <path d="M37.5 6.5 L53 19.5 V44.5 L37.5 57.5" />
      </g>
      <path fill="currentColor" d="M18 26 A14 17 0 0 0 46 26 A3.5 3.5 0 0 0 39 26 A7 7 0 0 1 25 26 A3.5 3.5 0 0 0 18 26 Z" />
    </svg>
  );
}

/**
 * Mark plus wordmark, as the reference sets a name: uppercase, geometric,
 * spaced wide. "THENAR" in the app, "THENARLABS" on the company pages.
 */
export function ThenarWordmark({ className, labs = false }: { className?: string; labs?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ThenarMark className="size-6 shrink-0 text-white" />
      <span className="wordmark text-sm text-white">
        Thenar{labs ? <span className="text-scribe-3">Labs</span> : null}
      </span>
    </span>
  );
}
