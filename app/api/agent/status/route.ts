import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { salesTo } from "@/lib/server/agent-sales";
import { AGENT_CORPUS, agentCorpusPrice } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What one agent wallet has bought, and on what terms it can buy more.
 *
 * Read from the sales ledger the paywall writes, with each sale's digest and
 * its place in SalesLog, so an agent can check the file it holds against the
 * chain without keeping its own record.
 */
async function handleGET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "address must be a 20-byte hex address" }, { status: 400 });
  }
  const sales = await salesTo(address);
  return NextResponse.json({
    address,
    terms: { endpoint: AGENT_CORPUS.path, price: agentCorpusPrice(), network: AGENT_CORPUS.network },
    purchases: sales.length,
    tasks: [...new Set(sales.map((s) => s.task_id))].sort((a, b) => a - b),
    sales: sales.map((s) => ({
      taskId: s.task_id, at: s.created_at, transaction: s.id, sha256: s.sha256,
      salesLog: s.log_contract ? { contract: s.log_contract, sequence: s.log_seq, transaction: s.log_tx } : null,
      unrecorded: s.audit_error,
    })),
  });
}

export const GET = logged("/api/agent/status", handleGET);
