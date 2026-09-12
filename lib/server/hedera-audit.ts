import "server-only";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import type { CorpusSale, SaleAudit } from "./agent-sales";

/**
 * Every pull, stated on Hedera by the seller.
 *
 * The sales table is this server's word, and a server can edit its own table.
 * A message on a Consensus Service topic that only the treasury's key can post
 * to is the same statement with a consensus timestamp and a sequence number
 * nobody here can change afterwards. It carries the sha256 of the exact bytes
 * served, so a buyer can hash the file they received and find it in the log,
 * and anyone can count what was sold without asking us.
 */

let client: Client | null = null;

function configured(): { client: Client; topicId: string } | null {
  const id = process.env.HEDERA_TREASURY_ID;
  const key = process.env.HEDERA_TREASURY_KEY;
  const topicId = process.env.HEDERA_SALES_TOPIC_ID;
  if (!id || !key || !topicId) return null;
  client ??= Client.forTestnet().setOperator(id, PrivateKey.fromStringECDSA(key.replace(/^0x/, "")));
  return { client, topicId };
}

/** Null when no topic is configured; throws when one is and the post fails. */
export async function publishSale(sale: CorpusSale, sha256: string): Promise<SaleAudit | null> {
  const h = configured();
  if (!h) return null;

  const message = JSON.stringify({
    v: 1,
    sale: sale.id,
    task: sale.task_id,
    terms: sale.method,
    buyer: sale.buyer,
    network: sale.network,
    amount: sale.amount,
    asset: sale.asset,
    sha256,
    at: sale.created_at,
  });

  const tx = await new TopicMessageSubmitTransaction().setTopicId(h.topicId).setMessage(message).execute(h.client);
  const receipt = await tx.getReceipt(h.client);
  return {
    topicId: h.topicId,
    sequence: Number(receipt.topicSequenceNumber?.toString()),
    transaction: tx.transactionId?.toString() ?? "",
  };
}
