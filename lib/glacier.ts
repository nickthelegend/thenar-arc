import { AXON_ADDRESS, appChain } from "@/lib/chain";
import { PROTOCOL_METHODS } from "@/lib/protocol-methods";

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

/**
 * Arc's own index of the chain, from Arcscan.
 *
 * Everything the app shows about a run is reconstructible from the contract,
 * but a list of every call an address made needs something that has already
 * walked the chain — plain RPC cannot answer "which transactions did this
 * address send". On Avalanche that was Glacier. Arcscan is Blockscout, and its
 * Etherscan-compatible txlist returns the same things Glacier did: the method
 * selector, gas, value, and whether the call reverted — so an operator's
 * settlement history survives our infrastructure disappearing entirely, and
 * reverted calls stay visible, which no event scan can show.
 *
 * No key is needed, which is why there is no credential here.
 */
const BASE = "https://testnet.arcscan.app/api";

type ArcscanTx = {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  isError: string;
  txreceipt_status?: string;
  gasUsed: string;
  gasPrice: string;
  from: string;
  to: string;
  methodId?: string;
  input?: string;
  contractAddress?: string;
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
  /** What the call cost the caller, in USDC — Arc's gas token, so this is the
   *  same currency as the payout it bought. */
  fee: number;
};

/**
 * Every call this address has made to the protocol, newest first, as Arcscan
 * recorded them. Nothing is inferred: a row exists only because the index
 * returned a transaction whose recipient is the contract.
 */
export async function settlementsFor(address: string, pages = 2): Promise<Settlement[]> {
  const out: Settlement[] = [];
  const offset = 100;

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(BASE);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "txlist");
    url.searchParams.set("address", address);
    url.searchParams.set("sort", "desc");
    url.searchParams.set("page", String(page));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Arcscan returned ${res.status}`);
    const json = (await res.json()) as { status?: string; message?: string; result?: ArcscanTx[] | string };
    // "No transactions found" arrives as status 0 with an empty result, which
    // is an answer, not a failure.
    const rows = Array.isArray(json.result) ? json.result : [];

    for (const t of rows) {
      const created = (t.contractAddress ?? "").toLowerCase() === AXON_ADDRESS.toLowerCase();
      if (!created && t.to?.toLowerCase() !== AXON_ADDRESS.toLowerCase()) continue;
      const gasUsed = Number(t.gasUsed);
      const gasPrice = Number(t.gasPrice);
      const selector = (t.methodId && t.methodId !== "0x" ? t.methodId : (t.input ?? "").slice(0, 10)).toLowerCase();
      out.push({
        txHash: t.hash,
        selector,
        method: created || !selector || selector === "0x"
          ? "contract deployment"
          : METHODS[selector] ?? `unrecognised (${selector})`,
        succeeded: t.isError === "0" && t.txreceipt_status !== "0",
        at: Number(t.timeStamp) * 1000,
        blockNumber: Number(t.blockNumber),
        gasUsed,
        // Native USDC has 18 decimals on Arc, so wei-per-gas times gas is an
        // amount of USDC once divided by 10^18.
        fee: (gasUsed * gasPrice) / 1e18,
      });
    }

    if (rows.length < offset) break;
  }

  return out.sort((a, b) => b.at - a.at);
}

/**
 * A task's own history, from the index.
 *
 * Filtered by the funder rather than by the task, because the index is keyed by
 * address and the funder is the only address that acts on a task's lifecycle.
 */
export async function funderHistory(funder: string, pages = 1): Promise<Settlement[]> {
  const all = await settlementsFor(funder, pages);
  const LIFECYCLE = new Set(["createTask", "createTaskUntil", "fundTask", "closeTask", "mintPolicy", "licensePolicy"]);
  return all.filter((s) => LIFECYCLE.has(s.method));
}
