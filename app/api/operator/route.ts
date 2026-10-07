import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { logged, logLine } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { challengeFor, hasPasskey, isOperator, OperatorError, verifyAssertion, type Assertion } from "@/lib/server/operator";
import { admitOperator, refusal, TokenError } from "@/lib/server/corpus-shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAddr = (a: unknown): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);

/** Where an address stands: a passkey on chain, and whether it may earn. */
async function handleGET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!isAddr(address)) return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  const [passkey, operator] = await Promise.all([hasPasskey(address), isOperator(address)]);
  return NextResponse.json({ address, passkey, operator });
}

/**
 * `challenge`: a one-time challenge for the passkey to sign.
 * `admit`: the signed challenge. Checked by PasskeyRegistry on Monad; on
 * success the address joins the CorpusShares whitelist, so its runs can be
 * signed and paid.
 */
async function handlePOST(req: Request) {
  const gate = rateLimit(`operator:${callerKey(req)}`, 12, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { action?: string; address?: string; assertion?: Assertion } | null;
  if (!isAddr(body?.address)) return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  const address = body.address;

  try {
    if (body.action === "challenge") {
      return NextResponse.json({ challenge: await challengeFor(address) });
    }
    if (body.action === "admit") {
      const digest = await verifyAssertion(address, body.assertion as Assertion, req.headers.get("origin"));
      try {
        const a = await admitOperator(getAddress(address), `passkey ${digest.slice(0, 18)}…`);
        return NextResponse.json({ admitted: true, already: a.already, tx: a.tx });
      } catch (e) {
        const rule = refusal(e);
        const error = e instanceof TokenError ? e.message : rule ? `The security refused: ${rule}` : e instanceof Error ? e.message.split("\n")[0] : "unknown";
        logLine("error", "operator_admit_failed", { address: address.toLowerCase(), error });
        return NextResponse.json({ admitted: false, error }, { status: 502 });
      }
    }
  } catch (e) {
    if (e instanceof OperatorError) {
      logLine("warn", "operator_refused", { address: address.toLowerCase(), status: e.status, reason: e.message });
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
  return NextResponse.json({ error: "action must be challenge or admit" }, { status: 400 });
}

export const GET = logged("/api/operator", handleGET);
export const POST = logged("/api/operator", handlePOST);
