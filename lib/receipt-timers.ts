import type { Hash, PublicClient, TransactionReceipt } from "viem";

/**
 * One honest number for a transaction: how long from send to final.
 *
 * Arc has deterministic finality. A block is final when it is produced, so a
 * transaction is final in the block that includes it: there is no "executed
 * but could still move" window, no confirmations to wait for, and no second
 * timer. The receipt is the settlement. The one timer is measured in this
 * page from the moment the wallet handed the transaction over (the signing
 * prompt is not in it) to the moment its receipt was in hand.
 *
 * That claim is checked, not assumed: right after the receipt arrives the node
 * is asked for its `finalized` block, and the timer records whether that tag
 * already covers the receipt's block. On Arc it does (the tag is the head). On
 * a local fork it does not (anvil's finalized tag trails its head by dozens of
 * blocks, the way Ethereum's trails by two epochs), and the card says that this
 * number is the fork's, not Arc's.
 */

export type TimerWhere = "arc" | "fork";

export type Timers = {
  where: TimerWhere;
  /** How the receipt came back: in the send's own response, or by asking for it. */
  via: "eth_sendRawTransactionSync" | "eth_getTransactionReceipt";
  /** Send to receipt: final, on Arc. */
  finalMs?: number;
  blockNumber?: bigint;
  /** Whether the node's `finalized` tag covered the receipt's block when it was read just after. */
  finalizedTagCovers?: boolean;
  /** Blocks between the head and the `finalized` tag at that moment: 0 on Arc. */
  finalizedLag?: number;
  /** The receipt did not arrive in the time allowed. */
  timedOut?: boolean;
};

export type Tracked = { receipt: TransactionReceipt; timers: Timers };

/** Receipts the local wallet already holds from `eth_sendRawTransactionSync`, keyed by hash. */
const synced = new Map<string, { sentAt: number; executedAt: number }>();

export function noteSynced(hash: Hash, sentAt: number, executedAt: number) {
  synced.set(hash.toLowerCase(), { sentAt, executedAt });
  if (synced.size > 50) synced.delete(synced.keys().next().value as string);
}

type Client = Pick<PublicClient, "waitForTransactionReceipt" | "getTransactionReceipt" | "getBlock" | "getBlockNumber">;

export async function trackReceipt(
  client: Client,
  hash: Hash,
  opts: { sentAt: number; where: TimerWhere; onUpdate?: (t: Timers) => void; timeoutMs?: number; now?: () => number },
): Promise<Tracked> {
  const now = opts.now ?? (() => performance.now());
  const sync = synced.get(hash.toLowerCase());
  const sentAt = sync?.sentAt ?? opts.sentAt;
  let timers: Timers = { where: opts.where, via: sync ? "eth_sendRawTransactionSync" : "eth_getTransactionReceipt" };
  const update = (t: Partial<Timers>) => { timers = { ...timers, ...t }; opts.onUpdate?.(timers); };

  let receipt: TransactionReceipt;
  if (sync) {
    receipt = await client.getTransactionReceipt({ hash });
    update({ finalMs: sync.executedAt - sync.sentAt, blockNumber: receipt.blockNumber });
  } else {
    // Arc produces a block every half second or so; polling faster than that only adds requests.
    receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 150, timeout: opts.timeoutMs ?? 60_000 });
    update({ finalMs: now() - sentAt, blockNumber: receipt.blockNumber });
  }

  // The check behind the word "final": does the node's finalized tag already include this block?
  try {
    const [tag, head] = await Promise.all([client.getBlock({ blockTag: "finalized" }), client.getBlockNumber()]);
    if (tag.number !== null) {
      update({
        finalizedTagCovers: tag.number >= receipt.blockNumber,
        finalizedLag: Math.max(0, Number(head - tag.number)),
      });
    }
  } catch {
    // A node without the tag answers nothing here; the timer itself stands.
  }
  return { receipt, timers };
}
