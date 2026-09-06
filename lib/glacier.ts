import { toFunctionSelector, type Abi } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, appChain } from "@/lib/chain";

/**
 * Avalanche's own index of the chain.
 *
 * Everything the app shows about a run is reconstructible from the contract,
 * but only if something is willing to walk the chain for it. That job has been
 * this deployment's SQLite file, which means a page that says "verify this
 * payout" depends on a server we happen to be running. Glacier is Avalanche's
 * indexer: given an address it returns that address's transactions against a
 * contract directly, so an operator's settlement history survives our
 * infrastructure disappearing entirely.
 *
 * The free tier needs no key, which is why there is no credential here.
 */
const BASE = "https://glacier-api.avax.network/v1";

/** Selector to the name of the thing it does. Glacier returns the four bytes;
 *  the ABI is what turns them back into a verb. Derived, never typed out — a
 *  hand-written selector table is how the wrong function ends up on screen. */
export const METHODS: Record<string, string> = Object.fromEntries(
  (AXON_ABI as Abi)
    .filter((f): f is Extract<Abi[number], { type: "function" }> => f.type === "function")
    .map((f) => [toFunctionSelector(f), f.name]),
);

export type GlacierTx = {
  txHash: string;
  blockNumber: string;
  blockTimestamp: number;
  txStatus: string;
  gasUsed: string;
  from: { address: string };
  to?: { address: string };
  method?: { methodHash?: string; callType?: string };
  value: string;
};

export type Settlement = {
  txHash: string;
  method: string;
  selector: string;
  succeeded: boolean;
  at: number;
  blockNumber: number;
  gasUsed: number;
};

/**
 * Every call this address has made to the protocol, newest first, as Avalanche
 * itself recorded them. Nothing is inferred: a row exists only because the
 * indexer returned a transaction whose recipient is the contract.
 */
export async function settlementsFor(address: string, pages = 2): Promise<Settlement[]> {
  const out: Settlement[] = [];
  let token: string | undefined;

  for (let i = 0; i < pages; i += 1) {
    const url = new URL(`${BASE}/chains/${appChain.id}/addresses/${address}/transactions:listNative`);
    url.searchParams.set("pageSize", "100");
    if (token) url.searchParams.set("pageToken", token);

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Glacier returned ${res.status}`);
    const json = (await res.json()) as { transactions?: GlacierTx[]; nextPageToken?: string };

    for (const t of json.transactions ?? []) {
      if (t.to?.address?.toLowerCase() !== AXON_ADDRESS.toLowerCase()) continue;
      const selector = t.method?.methodHash ?? "";
      out.push({
        txHash: t.txHash,
        selector,
        // An empty selector against this address is the deployment itself —
        // Glacier reports the created contract as the recipient and carries no
        // method hash, and calling that an "unknown call" was wrong.
        method: selector ? METHODS[selector] ?? `unrecognised (${selector})` : "contract deployment",
        succeeded: t.txStatus === "1",
        at: t.blockTimestamp * 1000,
        blockNumber: Number(t.blockNumber),
        gasUsed: Number(t.gasUsed),
      });
    }

    token = json.nextPageToken;
    if (!token) break;
  }

  return out.sort((a, b) => b.at - a.at);
}
