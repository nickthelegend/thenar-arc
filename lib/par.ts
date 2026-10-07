/**
 * Par time for a task, in seconds, derived from its difficulty.
 *
 * The contract stores difficulty because that is what a funder sets; par is
 * derived rather than stored so the two can never disagree. The efficiency
 * term of the score is measured against this.
 */
export function parSecondsFor(difficulty: number): number {
  const d = Math.min(5, Math.max(1, Math.round(difficulty)));
  return 45 + d * 28;
}
