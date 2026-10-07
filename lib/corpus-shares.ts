/**
 * The corpus as shares on Monad: what a run earns, and where the token lives.
 *
 * No imports, on purpose: scripts/shares.mjs loads this file with Node,
 * outside the Next build.
 */

/**
 * Shares one accepted run earns at a perfect score.
 *
 * Scaled by the score the verifier signed, so a clean run is worth more of the
 * corpus than a scrappy one, and the cap table reads as the contribution record.
 */
export const SHARES_PER_RUN = 100;

export const SHARES_SYMBOL = "THNRC";
