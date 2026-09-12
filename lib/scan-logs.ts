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
 *
 * The halves are asked for one after the other. They used to go out together,
 * which on Arc turned one refusal into a burst of hundreds of requests from
 * every open tab; the public endpoint answered with "rate limit exceeded" for
 * the whole machine, and every read that followed failed with it.
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
    const a = await scanLogs(fetchRange, { fromBlock, toBlock: mid });
    const b = await scanLogs(fetchRange, { fromBlock: mid + 1n, toBlock });
    return [...a, ...b];
  }
}

/** How far one request is asked to reach when walking a long history. Arc's
 *  public endpoints answer ten thousand blocks; the walk is sequential either way. */
const CHUNK = 10_000n;

type Cached = { through: bigint; logs: unknown[] };
const cache = new Map<string, Cached>();
const walking = new Map<string, Promise<unknown[]>>();

/**
 * Every log for `key` from `fromBlock` to `toBlock`, reading each block once.
 *
 * The first call walks the history in chunks, one request at a time. Later
 * calls ask only for the blocks after the last one read and append them, so a
 * feed that refreshes every few seconds costs one small request a refresh
 * instead of a scan of everything since deployment. Arc finalises a block when
 * it is included, so a log once read does not need reading again.
 *
 * Concurrent callers for the same key share one walk. A walk that fails caches
 * nothing, and the next call starts again from the last block that was read.
 */
export async function readLogsSince<T>(
  key: string,
  fetchRange: (range: LogRange) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<T[]> {
  const running = walking.get(key);
  if (running) return running as Promise<T[]>;

  const hit = cache.get(key);
  const start = hit ? hit.through + 1n : fromBlock;
  if (start > toBlock) return (hit?.logs ?? []) as T[];

  const walk = (async () => {
    const found: T[] = [];
    for (let from = start; from <= toBlock; from += CHUNK) {
      const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
      found.push(...(await scanLogs(fetchRange, { fromBlock: from, toBlock: to })));
    }
    const logs = [...((hit?.logs ?? []) as T[]), ...found];
    cache.set(key, { through: toBlock, logs });
    return logs;
  })();

  walking.set(key, walk);
  try {
    return await walk;
  } finally {
    walking.delete(key);
  }
}
