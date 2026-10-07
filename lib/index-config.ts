/**
 * Whether this deployment can list an address's calls, known before asking.
 *
 * An address's calls to ThenarProtocol come from Arc's Blockscout explorer
 * (lib/server/arc-index.ts), which needs no key. A local Arc fork has no
 * index at all, so every page that asked would get a 503 for a question whose
 * answer was fixed when the site was built. next.config.ts sets the flag.
 */
export const INDEX_CONFIGURED = process.env.NEXT_PUBLIC_INDEX_CONFIGURED === "1";

/** Read at build time, like the flag above. */
const FORK = (process.env.NEXT_PUBLIC_ARC_NETWORK ?? "").toLowerCase() === "fork";

export const INDEX_MISSING = FORK
  ? "Nothing indexes this local Arc fork, so these calls are not listed here. Every transaction is in the local explorer."
  : "Arc's explorer index is not reachable from this deployment, so these calls cannot be listed.";

/** GET an index route; a refusal rejects with the server's own sentence, not a guess at it. */
export async function fetchIndex<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The index answered ${r.status}.`);
  return body as T;
}
