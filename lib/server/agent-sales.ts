import "server-only";
import type { AgentKitStorage } from "@worldcoin/agentkit";
import { query, run } from "./sql";

/**
 * AgentKit's counters, in the database the corpus already lives in.
 *
 * The library ships an in-memory store. A free trial counted in memory resets
 * whenever the process restarts, which on a host that restarts on every deploy
 * is not a trial with a limit, and a nonce list in memory forgets which
 * challenges were already answered.
 */
export const agentKitStorage: AgentKitStorage = {
  async tryIncrementUsage(endpoint, humanId, limit) {
    // One statement, so no second request can land between the check and the
    // increment: either the row moves while it is under the limit and comes
    // back, or nothing does.
    const rows = await query<{ uses: number }>(
      `INSERT INTO agentkit_usage (endpoint, human_id, uses) VALUES (?, ?, 1)
       ON CONFLICT (endpoint, human_id) DO UPDATE SET uses = agentkit_usage.uses + 1
       WHERE agentkit_usage.uses < ?
       RETURNING uses`,
      [endpoint, humanId, limit],
    );
    return rows.length > 0;
  },
  async hasUsedNonce(nonce) {
    return (await query(`SELECT 1 AS n FROM agentkit_nonce WHERE nonce = ?`, [nonce])).length > 0;
  },
  async recordNonce(nonce) {
    await run(
      `INSERT INTO agentkit_nonce (nonce, created_at) VALUES (?, ?) ON CONFLICT (nonce) DO NOTHING`,
      [nonce, Date.now()],
    );
  },
};

export type CorpusSale = {
  /** The Hedera transaction id for a paid pull; `agentkit:<nonce>` for a free one. */
  id: string;
  task_id: number;
  method: "x402" | "agentkit";
  /** A Hedera account for a payment, the agent's address for a free pull. */
  buyer: string | null;
  network: string;
  /** Atomic units of `asset`. Null for a free pull, which moved nothing. */
  amount: string | null;
  asset: string | null;
  created_at: number;
};

export async function recordSale(s: CorpusSale): Promise<void> {
  await run(
    `INSERT INTO corpus_sale (id, task_id, method, buyer, network, amount, asset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at],
  );
}

export async function recentSales(limit = 50): Promise<CorpusSale[]> {
  return query<CorpusSale>(
    `SELECT id, task_id, method, buyer, network, amount, asset, created_at
       FROM corpus_sale ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}
