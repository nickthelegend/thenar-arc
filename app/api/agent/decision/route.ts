import { NextResponse } from "next/server";
import { recoverMessageAddress, type Hex } from "viem";
import { logged } from "@/lib/server/log";
import { decisionFor, saleById, saveDecision } from "@/lib/server/agent-sales";
import { canonical, decisionMessage, MAX_RECORD_BYTES, recordProblem, type DecisionRecord } from "@/lib/agent-decision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An agent's reasons for one purchase, signed by the key that paid for it.
 *
 *   POST /api/agent/decision   { record, signature }
 *   GET  /api/agent/decision?sale=0x…
 *
 * Kept only when all of these hold:
 * - the signature over the record's message recovers to the record's buyer;
 * - this ledger has the sale the record names, for the task it names;
 * - that sale was paid by the same address.
 * One record per sale, never replaced: a second one is refused, so a story
 * cannot be rewritten after the fact. Nothing in it is trusted beyond who
 * signed it; /agents shows it as the agent's own account and checks the
 * signature again in the page.
 */
async function handlePOST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_RECORD_BYTES + 2_000) return NextResponse.json({ error: "the record is too large" }, { status: 413 });
  let body: { record?: unknown; signature?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "the body is not JSON" }, { status: 400 }); }

  const problem = recordProblem(body.record);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) {
    return NextResponse.json({ error: "signature must be a 65-byte hex signature" }, { status: 400 });
  }
  const record = body.record as DecisionRecord;
  const signature = body.signature as Hex;

  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: decisionMessage(record), signature });
  } catch {
    return NextResponse.json({ error: "the signature does not recover" }, { status: 401 });
  }
  if (signer.toLowerCase() !== record.buyer.toLowerCase()) {
    return NextResponse.json({ error: "the record was not signed by the buyer it names" }, { status: 401 });
  }

  const sale = await saleById(record.sale.tx);
  if (!sale) return NextResponse.json({ error: "this ledger has no sale settled by that transaction" }, { status: 404 });
  if (sale.task_id !== record.sale.taskId) return NextResponse.json({ error: `that sale was for task ${sale.task_id}` }, { status: 400 });
  if (sale.buyer?.toLowerCase() !== signer.toLowerCase()) {
    return NextResponse.json({ error: "that sale was paid by another address" }, { status: 403 });
  }

  const saved = await saveDecision(sale.id, signer, canonical(record), signature);
  if (!saved) return NextResponse.json({ error: "this sale already has its decision record" }, { status: 409 });
  return NextResponse.json({ saved: true, sale: sale.id, signer }, { status: 201 });
}

async function handleGET(req: Request) {
  const sale = new URL(req.url).searchParams.get("sale") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(sale)) return NextResponse.json({ error: "sale must be a transaction hash" }, { status: 400 });
  const known = await saleById(sale);
  const d = known ? await decisionFor(known.id) : undefined;
  if (!d) return NextResponse.json({ error: "no decision record for that sale" }, { status: 404 });
  return NextResponse.json({ sale: known!.id, record: JSON.parse(d.record), signature: d.signature, signer: d.buyer, at: d.created_at });
}

export const POST = logged("/api/agent/decision", handlePOST);
export const GET = logged("/api/agent/decision", handleGET);
