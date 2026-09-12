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
 * link: nothing moved, and saying so is the record.
 */
async function handleGET() {
  const sales = await recentSales(100);
  return NextResponse.json({
    terms: {
      endpoint: AGENT_CORPUS.path,
      price: agentCorpusPrice(),
      network: AGENT_CORPUS.network,
      payTo: process.env.HEDERA_TREASURY_ID ?? null,
      facilitator: AGENT_CORPUS.facilitator,
      freePullsPerHuman: AGENT_CORPUS.freeUses,
      agentBook: AGENT_CORPUS.agentBook,
    },
    count: sales.length,
    sales: sales.map((s) => ({ ...s, proof: s.method === "x402" ? hashscanTx(s.id) : null })),
  });
}

export const GET = logged("/api/agent/sales", handleGET);
