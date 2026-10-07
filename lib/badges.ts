import { TOLERANCE_MM, ACCEPT_FLOOR } from "@/lib/score";

/**
 * What an operator's own record already says about them.
 *
 * This was on the rejected list as "gamification that competes with the payout
 * moment", and that was a judgement about taste rather than about truth. The
 * reason to be careful here is narrower and worth stating: a badge that awards
 * a made-up quantity — points, XP, a tier with no referent — would be the one
 * number on this site nobody could check, in a product whose whole claim is
 * that you can check the numbers.
 *
 * So none of these award anything. Each is a statement about the runs that are
 * already on the ledger, with the evidence for it named on the badge itself,
 * and each is recomputed from those runs rather than stored. Delete this file
 * and no fact about an operator changes.
 */

export type Run = {
  traj_hash: string;
  task_id: number;
  score: number;
  deviation_mm: number;
  duration_s: number;
  created_at: number;
};

export type Badge = {
  id: string;
  label: string;
  /** What is true, in the operator's own numbers. */
  evidence: string;
  /** Held, or not yet — an unearned badge still says what it would take. */
  earned: boolean;
  /** Progress toward it, 0..1, for the ones that are a count. */
  progress?: number;
};

/** Placement inside a third of the tolerance band is a deliberate placement,
 *  not a lucky one — tight enough that it cannot be reached by dropping. */
const PRECISE_MM = TOLERANCE_MM / 3;

export function badgesFor(runs: Run[]): Badge[] {
  const n = runs.length;
  const best = n ? Math.max(...runs.map((r) => r.score)) : 0;
  const tightest = n ? Math.min(...runs.map((r) => Math.abs(r.deviation_mm))) : Infinity;
  const tasks = new Set(runs.map((r) => r.task_id)).size;
  const fastest = n ? Math.min(...runs.map((r) => r.duration_s)) : Infinity;

  // A day here is the operator's own local day, which is the one they would
  // count in. Using UTC would split an evening session across two dates for
  // most of the world.
  const days = new Set(runs.map((r) => new Date(r.created_at).toDateString())).size;

  const count = (id: string, label: string, need: number, noun: string): Badge => ({
    id,
    label,
    earned: n >= need,
    progress: Math.min(1, n / need),
    evidence: n >= need ? `${n} ${noun}` : `${n} of ${need} ${noun}`,
  });

  return [
    count("first", "First run", 1, "accepted runs"),
    count("ten", "Ten runs", 10, "accepted runs"),
    count("fifty", "Fifty runs", 50, "accepted runs"),
    {
      id: "precise",
      label: "Inside a third",
      earned: tightest <= PRECISE_MM,
      evidence: Number.isFinite(tightest)
        ? `best placement ${tightest.toFixed(1)} mm, band ±${TOLERANCE_MM} mm`
        : "no runs yet",
    },
    {
      id: "high",
      label: "Above ninety",
      earned: best >= 9000,
      progress: Math.min(1, best / 9000),
      evidence: best ? `best score ${(best / 100).toFixed(2)}` : "no runs yet",
    },
    {
      id: "spread",
      label: "Three tasks",
      earned: tasks >= 3,
      progress: Math.min(1, tasks / 3),
      evidence: `${tasks} ${tasks === 1 ? "task" : "different tasks"}`,
    },
    {
      id: "returned",
      label: "Came back",
      earned: days >= 2,
      evidence: days >= 2 ? `recorded on ${days} separate days` : "one day so far",
    },
    {
      id: "quick",
      label: "Under ten seconds",
      earned: fastest <= 10,
      evidence: Number.isFinite(fastest) ? `fastest ${fastest.toFixed(1)}s` : "no runs yet",
    },
  ];
}

/** The floor is on the badge sheet too, because "accepted" is the word every
 *  one of these leans on and it has an exact meaning. */
export const ACCEPTED_MEANS = `scored at or above ${(ACCEPT_FLOOR / 100).toFixed(0)} and paid on chain`;
