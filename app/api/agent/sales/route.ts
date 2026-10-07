import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { corpusTreasury, recentSales } from "@/lib/server/agent-sales";
import { AGENT_CORPUS, agentCorpusPrice, explorerTx } from "@/lib/agent-corpus";
import { SALES_LOG, addressUrl, isAddress } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The terms an agent buys the corpus on, and every pull taken so far.
 *
 * A paid pull links to its settlement on Monadscan, so the sale is checkable
 * somewhere this server does not control. A free pull has no transaction to
 * link: nothing moved, and saying so is the record. Either kind, once logged,
 * links to its SalesLog entry with the sha256 of what was served.
 */
async function handleGET() {
  const sales = await recentSales(100);
  const salesLog = isAddress(SALES_LOG) ? SALES_LOG : null;
  return NextResponse.json({
    terms: {
      endpoint: AGENT_CORPUS.path,
      price: agentCorpusPrice(),
      network: AGENT_CORPUS.network,
      asset: AGENT_CORPUS.asset,
      payTo: corpusTreasury(),
      facilitator: AGENT_CORPUS.facilitator,
      salesLog,
      salesLogUrl: salesLog ? addressUrl(salesLog) : null,
    },
    count: sales.length,
    sales: sales.map(({ sha256, log_contract, log_seq, log_tx, audit_error, decision_record, decision_signature, ...s }) => ({
      ...s,
      // The buyer's own signed account of why it bought (lib/agent-decision.ts), when it gave one.
      decision: decision_record && decision_signature ? { record: JSON.parse(decision_record), signature: decision_signature } : null,
      proof: s.method === "x402" ? explorerTx(s.id) : null,
      audit: log_contract && log_seq !== null
        ? {
            contract: log_contract,
            sequence: Number(log_seq),
            sha256,
            transaction: log_tx,
            url: log_tx ? explorerTx(log_tx) : addressUrl(log_contract),
          }
        : sha256
          ? { error: audit_error, sha256 }
          : null,
    })),
  });
}

export const GET = logged("/api/agent/sales", handleGET);
