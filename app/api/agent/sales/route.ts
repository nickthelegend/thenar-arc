import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { recentSales } from "@/lib/server/agent-sales";
import { AGENT_CORPUS, agentCorpusPrice, hashscanTx } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The terms an agent buys the corpus on, and every pull taken so far.
 *
 * A paid pull links to its Hedera transaction, so the sale is checkable
 * somewhere this server does not control. A free pull has no transaction to
 * link: nothing moved, and saying so is the record. Either kind, once logged,
 * links to its message on the sales topic with the sha256 of what was served.
 */
async function handleGET() {
  const sales = await recentSales(100);
  const topic = process.env.HEDERA_SALES_TOPIC_ID ?? null;
  return NextResponse.json({
    terms: {
      endpoint: AGENT_CORPUS.path,
      price: agentCorpusPrice(),
      network: AGENT_CORPUS.network,
      payTo: process.env.HEDERA_TREASURY_ID ?? null,
      facilitator: AGENT_CORPUS.facilitator,
      freePullsPerHuman: AGENT_CORPUS.freeUses,
      agentBook: AGENT_CORPUS.agentBook,
      salesTopic: topic,
    },
    count: sales.length,
    sales: sales.map(({ sha256, topic_id, topic_seq, audit_error, ...s }) => ({
      ...s,
      proof: s.method === "x402" ? hashscanTx(s.id) : null,
      audit: topic_id && topic_seq !== null
        ? {
            topic: topic_id,
            sequence: Number(topic_seq),
            sha256,
            message: `${AGENT_CORPUS.mirror}/api/v1/topics/${topic_id}/messages/${topic_seq}`,
          }
        : sha256
          ? { error: audit_error, sha256 }
          : null,
    })),
  });
}

export const GET = logged("/api/agent/sales", handleGET);
