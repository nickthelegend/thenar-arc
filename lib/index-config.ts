/**
 * Whether this deployment can list an address's calls, known before asking.
 *
 * Monadscan's index is reached through Etherscan's V2 API with a key only the
 * server holds. Without one, every page that asked would get a 503, and the
 * browser logs each as an error, for a question whose answer was fixed when the
 * site was built. next.config.ts sets the flag from whether the key exists; the
 * key itself never reaches the client.
 */
export const INDEX_CONFIGURED = process.env.NEXT_PUBLIC_INDEX_CONFIGURED === "1";

/** Read at build time, like the flag above: a local-chain build has no Monadscan at all. */
const LOCAL = process.env.NEXT_PUBLIC_CHAIN === "local";

export const INDEX_MISSING = LOCAL
  ? "Monadscan does not index this local chain, so these calls are not listed here. Every transaction is in the local explorer."
  : "Monadscan's index needs an Etherscan API key, and this deployment has none, so these calls cannot be listed.";

/** GET an index route; a refusal rejects with the server's own sentence, not a guess at it. */
export async function fetchIndex<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? `The index answered ${r.status}.`);
  return body as T;
}
