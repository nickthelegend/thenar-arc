import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { HTTPFacilitatorClient, decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { withX402FromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/next";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { agentkitResourceServerExtension, createAgentkitHooks, declareAgentkitExtension } from "@worldcoin/agentkit";
import { createAgentBookVerifier, parseAgentkitHeader } from "@worldcoin/agentkit-core";
import { logged } from "@/lib/server/log";
import { taskCorpus } from "@/lib/server/corpus-export";
import { agentKitStorage, recordAudit, recordSale, type CorpusSale } from "@/lib/server/agent-sales";
import { publishSale } from "@/lib/server/hedera-audit";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One task's corpus, for an agent, paid in the request that fetches it.
 *
 * The first answer is a 402 carrying two offers. One is x402's exact scheme on
 * Hedera: half an HBAR to the corpus treasury, in a transfer the agent signs
 * and Blocky402 submits and pays the fee for. The other is AgentKit's: sign a
 * challenge with the agent's wallet, and if World's AgentBook maps that wallet
 * to a verified human, the first few pulls are free. An agent with no human
 * behind it is not refused; it pays.
 *
 * Settlement happens only after the export below returns a success, so an
 * agent that pays for a task with nothing recorded is told 404 and charged
 * nothing. Every pull that succeeds is recorded, hashed, and logged to a
 * Hedera Consensus Service topic with that hash.
 */

type Handler = (req: NextRequest) => Promise<NextResponse>;
let paywalled: Handler | null = null;

/**
 * AgentKit's server extension, with the challenge fields that are new on every
 * 402 said to be new on every 402.
 *
 * x402 checks that a paying client echoes the extensions it was offered, field
 * for field. AgentKit 0.2.1 predates that check and does not declare that its
 * nonce and timestamps are regenerated per response, so without this every paid
 * retry fails as `extension_echo_mismatch`: the client echoes the nonce it was
 * handed and the server compares it with the one it has just minted. Leaving
 * them out of the echo comparison weakens nothing — AgentKit checks its own
 * nonce against the database before it grants a free pull.
 */
const agentkitExtension = {
  ...agentkitResourceServerExtension,
  dynamicInfoFields: ["nonce", "issuedAt", "expirationTime"],
};

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
    .register(AGENT_CORPUS.network, new ExactHederaScheme())
    .registerExtension(agentkitExtension);

  const hooks = createAgentkitHooks({
    agentBook: createAgentBookVerifier(),
    mode: { type: "free-trial", uses: AGENT_CORPUS.freeUses },
    storage: agentKitStorage,
  });

  const http = new x402HTTPResourceServer(resourceServer, {
    [AGENT_CORPUS.path]: {
      accepts: {
        scheme: "exact",
        network: AGENT_CORPUS.network,
        payTo: treasury,
        price: { amount: AGENT_CORPUS.amount, asset: AGENT_CORPUS.asset },
        maxTimeoutSeconds: 120,
      },
      description:
        "One task's robot-arm trajectory corpus from Thenar: every accepted run, paid on Arc, " +
        "with the failures kept in their own labelled array.",
      mimeType: "application/json",
      serviceName: "Thenar corpus",
      extensions: declareAgentkitExtension({
        statement: "Sign in as an agent. If a verified human stands behind this wallet, the first pulls are free.",
        network: AGENT_CORPUS.agentBook.network,
        mode: { type: "free-trial", uses: AGENT_CORPUS.freeUses },
        expirationSeconds: 300,
      }),
    },
  }).onProtectedRequest(hooks.requestHook);

  paywalled = withX402FromHTTPServer(corpus, http);
  return paywalled;
}

/**
 * The terms a successful response was served on, read from what granted it.
 *
 * A settlement receipt means it was paid. A success with no payment on this
 * protected route can only have been granted by AgentKit, so the agentkit
 * header says who took it.
 */
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
  const agent = req.headers.get("agentkit");
  if (agent && !req.headers.get("payment-signature")) {
    const p = parseAgentkitHeader(agent);
    return {
      id: `agentkit:${p.nonce}`, task_id: taskId, method: "agentkit",
      buyer: p.address.toLowerCase(), network: p.chainId,
      amount: null, asset: null, created_at: Date.now(),
    };
  }
  return null;
}

const headerSafe = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").slice(0, 200);

async function handleGET(req: Request) {
  const treasury = process.env.HEDERA_TREASURY_ID;
  if (!treasury || !/^0\.0\.\d+$/.test(treasury)) {
    return NextResponse.json(
      { error: "No Hedera treasury is configured, so there is nothing to pay. Set HEDERA_TREASURY_ID." },
      { status: 503 },
    );
  }

  const res = await build(treasury)(req as NextRequest);

  // x402 v2 puts the offer in a header and leaves the body empty. AgentKit's
  // client reads the offer from the body, and so does anyone reading a 402 by
  // hand, so the same object goes in both. Browsers get the paywall page as is.
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
    await recordAudit(sale.id, sha256, audit, audit ? null : "no sales topic is configured");
    headers.set("x-thenar-audit", audit ? `${audit.topicId}#${audit.sequence}` : "unrecorded: no sales topic is configured");
  } catch (e) {
    const reason = e instanceof Error ? e.message.split("\n")[0] : "unknown error";
    await recordAudit(sale.id, sha256, null, reason);
    headers.set("x-thenar-audit", headerSafe(`unrecorded: ${reason}`));
  }

  return new NextResponse(body, { status: res.status, headers });
}

export const GET = logged(AGENT_CORPUS.path, handleGET);
