import type { Hash, PublicClient, TransactionReceipt } from "viem";

/**
 * Two honest numbers for a transaction: when it executed, and when it was final.
 *
 * On Monad a receipt arrives once the block holding the transaction is
 * Proposed and executed speculatively, about one 300 ms block after it is
 * sent. That receipt is not yet final: the block becomes irreversible two
 * slots later, and until then the transaction can land in a different
 * proposal at the same height. So there are two timers:
 * - "executed": the receipt is in hand;
 * - "final": the `finalized` tag has reached the receipt's block, and the
 *   block at that height has the receipt's hash.
 *
 * Both are measured in this page from the moment the transaction left the
 * wallet. Wallet time (the signing prompt) is not in either. On Monad the node
 * is also asked, while the receipt is outstanding, whether it has the
 * transaction at all (`txpool_statusByHash`), because `eth_getTransactionByHash`
 * on Monad does not return pending transactions.
 *
 * On a local chain the same code runs, but the numbers say nothing about
 * Monad: anvil mines on demand, and its `finalized` tag trails the head by 63
 * blocks, the way Ethereum's trails by two epochs. The caller labels them by
 * `where`, and the lag between the head and the finalized tag is measured and
 * reported, since it is the difference that matters: on Monad it is two blocks.
 *
 * The receipt is returned as soon as it executes; finality is a second promise,
 * so a caller can wait for it (crediting value on Monad, about 600 ms more) or
 * let the card fill in when it lands (a local chain's minute).
 */

export type TimerWhere = "monad" | "local";

export type Timers = {
  where: TimerWhere;
  /** How the receipt came back: in the send's own response, or by asking for it. */
  via: "eth_sendRawTransactionSync" | "eth_getTransactionReceipt";
  /** The first answer from `txpool_statusByHash` that knew the transaction (Monad only). */
  seen?: { ms: number; status: string };
  executedMs?: number;
  finalMs?: number;
  blockNumber?: bigint;
  /** The receipt's block was replaced by another proposal before it finalized, and the receipt was read again. */
  moved?: boolean;
  /** Blocks between the head and the `finalized` tag, when finality was first checked. */
  finalizedLag?: number;
  /** Finality was not observed within the time allowed. */
  timedOut?: boolean;
};

export type Tracked = {
  receipt: TransactionReceipt;
  timers: Timers;
  /** Resolves once the receipt's block is final (or the wait times out). */
  final: Promise<{ receipt: TransactionReceipt; timers: Timers }>;
};

/** Receipts the local wallet already holds from `eth_sendRawTransactionSync`, keyed by hash. */
const synced = new Map<string, { sentAt: number; executedAt: number }>();

export function noteSynced(hash: Hash, sentAt: number, executedAt: number) {
  synced.set(hash.toLowerCase(), { sentAt, executedAt });
  if (synced.size > 50) synced.delete(synced.keys().next().value as string);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `txpool_statusByHash` answers; anything but these means the node holds the transaction. */
const UNKNOWN = /unknown|not found/i;

export async function trackReceipt(
  client: PublicClient,
  hash: Hash,
  opts: { sentAt: number; where: TimerWhere; onUpdate?: (t: Timers) => void; finalWithinMs?: number; now?: () => number },
): Promise<Tracked> {
  const now = opts.now ?? (() => performance.now());
  const poll = opts.where === "monad" ? 100 : 250;
  const sync = synced.get(hash.toLowerCase());
  const sentAt = sync?.sentAt ?? opts.sentAt;
  let timers: Timers = { where: opts.where, via: sync ? "eth_sendRawTransactionSync" : "eth_getTransactionReceipt" };
  const update = (t: Partial<Timers>) => { timers = { ...timers, ...t }; opts.onUpdate?.(timers); };

  let receipt: TransactionReceipt;
  if (sync) {
    receipt = await client.getTransactionReceipt({ hash });
    update({ executedMs: sync.executedAt - sync.sentAt, blockNumber: receipt.blockNumber });
  } else {
    let settled = false;
    if (opts.where === "monad") {
      void (async () => {
        while (!settled && !timers.seen) {
          try {
            const r = (await client.request({ method: "txpool_statusByHash" as never, params: [hash] as never })) as unknown;
            const status = typeof r === "string" ? r : (r as { status?: string } | null)?.status;
            if (status && !UNKNOWN.test(status)) update({ seen: { ms: now() - sentAt, status } });
          } catch {
            // Not every endpoint serves txpool_*; the receipt is still coming.
          }
          await wait(poll);
        }
      })();
    }
    try {
      receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: poll, timeout: 60_000 });
    } finally {
      settled = true;
    }
    update({ executedMs: now() - sentAt, blockNumber: receipt.blockNumber });
  }

  const executed = { receipt, timers };
  const final = (async () => {
    // A local chain's finalized tag trails by a minute of blocks; Monad's by two.
    const deadline = now() + (opts.finalWithinMs ?? (opts.where === "local" ? 150_000 : 30_000));
    let lagRead = false;
    while (now() < deadline) {
      const head = await client.getBlock({ blockTag: "finalized" }).catch(() => null);
      if (head && head.number !== null && !lagRead) {
        lagRead = true;
        const latest = await client.getBlockNumber().catch(() => null);
        if (latest !== null) update({ finalizedLag: Math.max(0, Number(latest - head.number)) });
      }
      if (head && head.number !== null && head.number >= receipt.blockNumber) {
        const at = head.number === receipt.blockNumber ? head : await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
        if (at && at.hash === receipt.blockHash) {
          update({ finalMs: now() - sentAt });
          return { receipt, timers };
        }
        if (at) {
          // Another proposal won this height: the transaction is in a different block, or back in the pool.
          update({ moved: true });
          receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: poll, timeout: 30_000 });
          update({ blockNumber: receipt.blockNumber });
        }
      }
      await wait(poll);
    }
    update({ timedOut: true });
    return { receipt, timers };
  })();
  return { ...executed, final };
}
