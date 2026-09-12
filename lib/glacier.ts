import { AXON_ADDRESS, appChain } from "@/lib/chain";
import { PROTOCOL_METHODS } from "@/lib/protocol-methods";

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
/**
 * Every function the deployed protocol has, by selector.
 *
 * This used to be built from AXON_ABI, which is the pruned list of calls the
 * interface makes — so a settlement log resolving against it could name a call
 * the interface makes and nothing else. A third of this contract's history came
 * back "unrecognised": createTaskUntil, closeTask and submitTrajectoryFor, all
 * real functions of the deployed contract that this frontend never calls.
 *
 * Generated from the compiler's artifact by scripts/gen-abi.mjs, so it cannot
 * name a function the deployed contract does not have, and cannot miss one it
 * does.
 */
export const METHODS = PROTOCOL_METHODS;

export type GlacierTx = {
  txHash: string;
  blockNumber: string;
  blockTimestamp: number;
  txStatus: string;
  gasUsed: string;
  gasPrice: string;
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
  /** What the call actually cost the caller, in AVAX. Fuji settles at 160 wei
   *  a unit, so this is a very small number — which is the point: an operator
   *  should be able to see that submitting is effectively free. */
  feeAvax: number;
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
      const gasUsed = Number(t.gasUsed);
      const gasPrice = Number(t.gasPrice);
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
        gasUsed,
        // gasPrice is wei, confirmed against a receipt's effectiveGasPrice
        // rather than assumed — reading it as gwei overstated the fee by 10^9.
        feeAvax: (gasUsed * gasPrice) / 1e18,
      });
    }

    token = json.nextPageToken;
    if (!token) break;
  }

  return out.sort((a, b) => b.at - a.at);
}


/**
 * A task's own history, from Avalanche's index.
 *
 * The task page reads its state from the contract, which tells you what a task
 * *is* — not what happened to it. Who funded it and when, whether it was topped
 * up, whether a policy was minted against it: that is a sequence of calls, and
 * the indexer already has them.
 *
 * Filtered by the funder rather than by the task, because Glacier indexes by
 * address and the funder is the only address that acts on a task's lifecycle.
 * Calls that name no task are still shown — they are that funder's activity
 * against this protocol, which is the honest framing rather than pretending a
 * per-task feed exists.
 */
export async function funderHistory(funder: string, pages = 1): Promise<Settlement[]> {
  const all = await settlementsFor(funder, pages);
  const LIFECYCLE = new Set(["createTask", "fundTask", "mintPolicy", "licensePolicy"]);
  return all.filter((s) => LIFECYCLE.has(s.method));
}
