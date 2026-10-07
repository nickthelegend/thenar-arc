/**
 * A ceiling on how often one caller can do something expensive.
 *
 * The props endpoint parses and stores multi-megabyte binaries on a volume
 * shared with the trajectory ledger; without a limit, one client can fill it.
 * Deliberately in memory: the window is a minute, the cost of forgetting on a
 * restart is one extra upload, and a durable store for that would be heavier
 * than the thing it protects.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): {
  ok: boolean; remaining: number; retryAfterMs: number;
} {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= max) {
    buckets.set(key, hits);
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - hits[0]) };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Keep the map from growing without bound on a long-lived server.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return { ok: true, remaining: max - hits.length, retryAfterMs: 0 };
}

/** The caller, as well as it can be known behind a proxy. */
export function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
