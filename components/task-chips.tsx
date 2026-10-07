import { cn } from "@/lib/cn";
import { EMBODIMENTS } from "@/lib/embodiment";
import type { ArmKind, ScannedScene } from "@/lib/scan";

const mm = (v: number) => Math.round(v * 1000);

/**
 * What a task's name carries besides its sentence: the arm it runs on, and
 * whether its bench was measured off a real table. Both are read from the name on chain, so a chip here is never a
 * claim the contract does not make.
 */
export function TaskChips({ task, className }: {
  task: { arm: ArmKind; scanned: ScannedScene | null };
  className?: string;
}) {
  const chip = "border px-1.5 py-px text-[11px] whitespace-nowrap";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(chip, task.arm === "so101" ? "border-probe/60 text-probe" : "border-rule-strong text-scribe-3")}
        title={EMBODIMENTS[task.arm].blurb}
      >
        {EMBODIMENTS[task.arm].label}
      </span>
      {task.scanned ? (
        <span
          className={cn(chip, "border-go/60 text-go")}
          title={`Measured off a real table: the payload starts at ${mm(task.scanned.pick[0])}, ${mm(task.scanned.pick[1])} mm and goes to ${mm(task.scanned.place[0])}, ${mm(task.scanned.place[1])} mm from the arm's base.`}
        >
          Scanned
        </span>
      ) : null}
    </span>
  );
}
