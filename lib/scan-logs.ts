/**
 * Read a log range without knowing what the endpoint will accept.
 *
 * Every log-reading path in this app has, at some point, encoded a guess about
 * how many blocks a single `getLogs` may span, and every guess has been wrong
 * in a way that took a surface down quietly.
 *
 * The first guess was two thousand, walked back forty times. That assumed a cap
 * far tighter than the primary endpoint enforces, and produced a window of
 * eighty thousand blocks — under two days on this chain — so the standings and
 * the feed went empty a week after the runs they read were recorded. Not with
 * an error: with a legitimate-looking nothing.
 *
 * The second guess was a million in one call, which the primary does answer.
 * But the secondaries this app now fails over to do not: publicnode refuses
 * above about fifty thousand and drpc above about ten. A failover under that
 * assumption swaps a dead endpoint for a live one that returns nothing.
 *
 * So there is no guess. Ask for the whole range; if the endpoint refuses, halve
 * it and ask again for both halves. The range is a property of the deployment's
 * history and the splitting is a property of whoever is answering, which is the
 * only division that survives changing either.
 */

export type LogRange = { fromBlock: bigint; toBlock: bigint };

/** Below this a refusal is not about the range, and splitting further only
 *  multiplies requests against an endpoint that is failing for another reason. */
const FLOOR = 2_000n;

export async function scanLogs<T>(
  fetchRange: (range: LogRange) => Promise<T[]>,
  range: LogRange,
): Promise<T[]> {
  const { fromBlock, toBlock } = range;
  if (toBlock < fromBlock) return [];

  try {
    return await fetchRange(range);
  } catch (err) {
    const span = toBlock - fromBlock;
    // At the floor the endpoint is not refusing the width, so re-raise rather
    // than turning one real failure into a storm of small ones.
    if (span <= FLOOR) throw err;

    const mid = fromBlock + span / 2n;
    const [a, b] = await Promise.all([
      scanLogs(fetchRange, { fromBlock, toBlock: mid }),
      scanLogs(fetchRange, { fromBlock: mid + 1n, toBlock }),
    ]);
    return [...a, ...b];
  }
}
