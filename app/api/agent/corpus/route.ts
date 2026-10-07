import { createHash } from "node:crypto";
import { APP_ORIGIN } from "@/lib/site";
import { NextRequest, NextResponse } from "next/server";
import { HTTPFacilitatorClient, decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { withX402FromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/next";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { logged } from "@/lib/server/log";
import { taskCorpus } from "@/lib/server/corpus-export";
import { corpusTreasury, recordAudit, recordSale, type CorpusSale } from "@/lib/server/agent-sales";
import { publishSale } from "@/lib/server/sales-log";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One task's corpus, for an agent, paid in the request that fetches it.
 *
 * The first answer is a 402 carrying the offer: x402's exact scheme on Monad,
 * a cent of USDC to the corpus treasury, as an EIP-3009 authorisation the
 * agent signs and the Monad facilitator submits and pays the gas for.
 *
 * Settlement happens only after the export below returns a success, so an
 * agent that pays for a task with nothing recorded is told 404 and charged
 * nothing. Every pull that succeeds is recorded, hashed, and logged to
 * SalesLog on Monad with that hash.
 */

type Handler = (req: NextRequest) => Promise<NextResponse>;
let paywalled: Handler | null = null;

function taskIdOf(url: string): number | null {
  const raw = new URL(url).searchParams.get("taskId");
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

async function corpus(req: NextRequest): Promise<NextResponse> {
  const taskId = taskIdOf(req.url);
  if (taskId === null) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }
  return taskCorpus(taskId);
}

function build(treasury: string): Handler {
  if (paywalled) return paywalled;

  const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: AGENT_CORPUS.facilitator }))
    .register(AGENT_CORPUS.network, new ExactEvmScheme());

  const http = new x402HTTPResourceServer(resourceServer, {
    [AGENT_CORPUS.path]: {
      accepts: {
        scheme: "exact",
        network: AGENT_CORPUS.network,
        payTo: treasury,
        price: { amount: AGENT_CORPUS.amount, asset: AGENT_CORPUS.asset, extra: { ...AGENT_CORPUS.assetDomain } },
        maxTimeoutSeconds: 120,
      },
      description:
        "One task's robot-arm trajectory corpus from Thenar: every accepted run, paid on Monad, " +
        "with the failures kept in their own labelled array.",
      mimeType: "application/json",
      serviceName: "Thenar corpus",
    },
  });

  paywalled = withX402FromHTTPServer(corpus, http);
  return paywalled;
}

/** The sale a successful response records: its settlement receipt says who paid. */
function saleOf(req: Request, res: Response, taskId: number): CorpusSale | null {
  const receipt = res.headers.get("PAYMENT-RESPONSE");
  if (receipt) {
    const settled = decodePaymentResponseHeader(receipt);
    if (!settled.success || !settled.transaction) return null;
    return {
      id: settled.transaction, task_id: taskId, method: "x402",
      buyer: settled.payer ?? null, network: settled.network,
      amount: AGENT_CORPUS.amount, asset: AGENT_CORPUS.asset, created_at: Date.now(),
    };
  }
  return null;
}

/**
 * The request as the buyer addressed it. Behind Vercel's rewrite the backend
 * sees its own address, so the offer's resource read
 * https://localhost:8080/api/agent/corpus, a URL no agent can fetch. The
 * public origin is configured, never taken from a header a caller could set.
 */
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN ?? APP_ORIGIN).replace(/\/$/, "");
function asPublic(req: Request): NextRequest {
  if (!PUBLIC_ORIGIN) return req as NextRequest;
  const u = new URL(req.url);
  return new NextRequest(`${PUBLIC_ORIGIN}${u.pathname}${u.search}`, req);
}

const headerSafe = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").slice(0, 200);

async function handleGET(req: Request) {
  const treasury = corpusTreasury();
  if (!treasury) {
    return NextResponse.json(
      { error: "No corpus treasury is configured, so there is nothing to pay. Set CORPUS_TREASURY." },
      { status: 503 },
    );
  }

  // Before the paywall, not inside it: a malformed task id was answered with an
  // offer to sell it, so the caller learned it was wrong only after paying.
  if (taskIdOf(req.url) === null) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }

  const res = await build(treasury)(asPublic(req));

  // x402 v2 puts the offer in a header and leaves the body empty. Anyone
  // reading a 402 by hand reads the body, so the same object goes in both. Browsers get the paywall page as is.
  if (res.status === 402 && !res.headers.get("content-type")?.includes("text/html")) {
    const offer = res.headers.get("PAYMENT-REQUIRED");
    if (offer) {
      const headers = new Headers(res.headers);
      headers.set("content-type", "application/json");
      headers.delete("content-length");
      return new NextResponse(JSON.stringify(decodePaymentRequiredHeader(offer)), { status: 402, headers });
    }
  }

  const taskId = taskIdOf(req.url);
  const sale = res.ok && taskId !== null ? saleOf(req, res, taskId) : null;
  if (!sale) return res;
  await recordSale(sale);

  // The file as served, byte for byte, so the digest is of what the buyer holds.
  const body = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash("sha256").update(body).digest("hex");
  const headers = new Headers(res.headers);
  headers.set("x-thenar-sha256", sha256);

  // The payment has already settled by now. If the log cannot be written, the
  // buyer still gets what it paid for, and the gap is recorded and said.
  try {
    const audit = await publishSale(sale, sha256);
    await recordAudit(sale.id, sha256, audit, audit ? null : "no SalesLog is deployed");
    headers.set("x-thenar-audit", audit ? `${audit.contract}#${audit.sequence}` : "unrecorded: no SalesLog is deployed");
  } catch (e) {
    const reason = e instanceof Error ? e.message.split("\n")[0] : "unknown error";
    await recordAudit(sale.id, sha256, null, reason);
    headers.set("x-thenar-audit", headerSafe(`unrecorded: ${reason}`));
  }

  return new NextResponse(body, { status: res.status, headers });
}

export const GET = logged(AGENT_CORPUS.path, handleGET);
