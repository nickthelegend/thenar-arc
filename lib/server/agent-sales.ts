import "server-only";
import { ACTIVE_DEPLOYMENT as DEPLOYMENT, isAddress } from "@/lib/chain";
import { query, run } from "./sql";

/** Where corpus sales are paid: CORPUS_TREASURY, or the deployer that funds the tasks. */
export function corpusTreasury(): string | null {
  const t = process.env.CORPUS_TREASURY || DEPLOYMENT.deployer;
  return isAddress(t) ? t : null;
}

export type CorpusSale = {
  /** The settlement tx hash for a paid pull; `agentkit:<nonce>` for a free one. */
  id: string;
  task_id: number;
  /** Every sale is x402; "agentkit" survives only on rows from before World's
   *  free-pull path was removed. */
  method: "x402" | "agentkit";
  /** The paying address for a payment, the agent's address for a free pull. */
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
    // Lowercased: x402 reports the payer checksummed, and an address is one
    // address however it is cased.
    [s.id, s.task_id, s.method, s.buyer?.toLowerCase() ?? null, s.network, s.amount, s.asset, s.created_at],
  );
}

export type SaleAudit = { contract: string; sequence: number; transaction: string };

/**
 * The digest of what a sale served, and where in SalesLog it was logged.
 *
 * Written even when the log could not be posted, with the reason, so a sale
 * missing from the log is visibly missing rather than quietly so.
 */
export async function recordAudit(
  saleId: string, sha256: string, audit: SaleAudit | null, error: string | null,
): Promise<void> {
  await run(
    `INSERT INTO corpus_sale_audit (sale_id, sha256, log_contract, log_seq, transaction_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (sale_id) DO NOTHING`,
    [saleId, sha256, audit?.contract ?? null, audit?.sequence ?? null, audit?.transaction ?? null, error, Date.now()],
  );
}

export type ListedSale = CorpusSale & {
  sha256: string | null;
  log_contract: string | null;
  log_seq: number | null;
  log_tx: string | null;
  audit_error: string | null;
  /** The buyer's signed decision record (lib/agent-decision.ts), as stored. */
  decision_record: string | null;
  decision_signature: string | null;
};

/** The sale a transaction settled, if this ledger has it. */
export async function saleById(id: string): Promise<CorpusSale | undefined> {
  const rows = await query<CorpusSale>(
    `SELECT id, task_id, method, buyer, network, amount, asset, created_at FROM corpus_sale WHERE LOWER(id) = ?`,
    [id.toLowerCase()],
  );
  return rows[0];
}

/** Keep a decision record; false when the sale already has one, which is never replaced. */
export async function saveDecision(saleId: string, buyer: string, record: string, signature: string): Promise<boolean> {
  const before = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM agent_decision WHERE sale_id = ?`, [saleId]);
  if (Number(before[0]?.n ?? 0) > 0) return false;
  await run(
    `INSERT INTO agent_decision (sale_id, buyer, record, signature, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (sale_id) DO NOTHING`,
    [saleId, buyer.toLowerCase(), record, signature, Date.now()],
  );
  return true;
}

export async function decisionFor(saleId: string) {
  const rows = await query<{ record: string; signature: string; buyer: string; created_at: number }>(
    `SELECT record, signature, buyer, created_at FROM agent_decision WHERE sale_id = ?`,
    [saleId],
  );
  return rows[0];
}

export async function recentSales(limit = 50): Promise<ListedSale[]> {
  return query<ListedSale>(
    `SELECT s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at,
            a.sha256, a.log_contract, a.log_seq, a.transaction_id AS log_tx, a.error AS audit_error,
            d.record AS decision_record, d.signature AS decision_signature
       FROM corpus_sale s LEFT JOIN corpus_sale_audit a ON a.sale_id = s.id
       LEFT JOIN agent_decision d ON d.sale_id = s.id
      ORDER BY s.created_at DESC LIMIT ?`,
    [limit],
  );
}

/** Everything one agent wallet has bought, newest first. */
export async function salesTo(buyer: string, limit = 50): Promise<ListedSale[]> {
  return query<ListedSale>(
    `SELECT s.id, s.task_id, s.method, s.buyer, s.network, s.amount, s.asset, s.created_at,
            a.sha256, a.log_contract, a.log_seq, a.transaction_id AS log_tx, a.error AS audit_error,
            d.record AS decision_record, d.signature AS decision_signature
       FROM corpus_sale s LEFT JOIN corpus_sale_audit a ON a.sale_id = s.id
       LEFT JOIN agent_decision d ON d.sale_id = s.id
      WHERE lower(s.buyer) = ?
      ORDER BY s.created_at DESC LIMIT ?`,
    [buyer.toLowerCase(), limit],
  );
}
