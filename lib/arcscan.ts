import { AXON_ADDRESS, LOCALNET, appChain } from "@/lib/chain";
import { PROTOCOL_METHODS } from "@/lib/protocol-methods";

/**
 * Every function the deployed protocol has, by selector.
 *
 * Generated from the compiler's artifact by scripts/gen-abi.mjs, so it cannot
 * name a function the deployed contract does not have, and cannot miss one it
 * does.
 */
export const METHODS = PROTOCOL_METHODS;

/**
 * Arc's own index of the chain, from its Blockscout explorer.
 *
 * Everything the app shows about a run is reconstructible from the contract,
 * but a list of every call an address made needs something that has already
 * walked the chain: plain RPC cannot answer "which transactions did this
 * address send". Arc's explorer is Blockscout, whose Etherscan-compatible
 * `/api?module=account&action=txlist` returns the method selector, gas and
 * whether the call reverted, so reverted calls stay visible, which no event
 * scan can show. It needs no key.
 *
 * A local fork has no explorer index; there every transaction is in the app's
 * own /explorer, read straight off the node.
 */
const BASE = `${appChain.blockExplorers.default.url}/api`;

export class IndexUnavailable extends Error {}

type IndexedTx = {
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
  /** What the call cost the caller in gas, in USDC: the same dollar as the
   *  payout it bought (gas used times price, 18-decimal native units). */
  fee: number;
};

/**
 * The index's last answer per address, and the request already on its way.
 *
 * A task page asks for its funder's history on every load — twice under React's
 * development double effect — and a public explorer API allows a few requests a
 * second. An answer is reused for thirty seconds, concurrent callers share one
 * request, and when the index refuses, the last list it did return is used if
 * it is under ten minutes old. Older than that, the refusal is passed on.
 */
const FRESH_MS = 30_000;
const STALE_OK_MS = 10 * 60_000;
const answered = new Map<string, { at: number; value: Settlement[] }>();
const asking = new Map<string, Promise<Settlement[]>>();

/**
 * Every call this address has made to the protocol, newest first, as Arc's explorer
 * recorded them. Nothing is inferred: a row exists only because the index
 * returned a transaction whose recipient is the contract.
 */
export async function settlementsFor(address: string, pages = 2): Promise<Settlement[]> {
  const key = `${address.toLowerCase()}:${pages}`;
  const last = answered.get(key);
  if (last && Date.now() - last.at < FRESH_MS) return last.value;
  const inFlight = asking.get(key);
  if (inFlight) return inFlight;

  const request = readSettlements(address, pages)
    .then((value) => {
      answered.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((e: unknown) => {
      if (last && Date.now() - last.at < STALE_OK_MS) return last.value;
      throw e;
    })
    .finally(() => asking.delete(key));
  asking.set(key, request);
  return request;
}

async function readSettlements(address: string, pages: number): Promise<Settlement[]> {
  // A fork has no explorer index: say that, rather than answer with an empty history.
  if (LOCALNET) {
    throw new IndexUnavailable("Arc's explorer does not index this local fork. Every transaction is in the local explorer.");
  }
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
    if (!res.ok) throw new Error(`Arc's explorer returned ${res.status}`);
    const json = (await res.json()) as { status?: string; message?: string; result?: IndexedTx[] | string };
    // "No transactions found" arrives as status 0 with an empty result, which
    // is an answer, not a failure. A refusal arrives as status 0 with the
    // reason in `result`, which is.
    if (json.status === "0" && typeof json.result === "string" && !/no transactions/i.test(json.message ?? "")) {
      throw new IndexUnavailable(`Arc's explorer refused: ${json.result}`);
    }
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
        // Gas is native USDC at 18 decimals: price times gas used, over 10^18,
        // is dollars. Arc charges the gas used, which is what the index reports.
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
