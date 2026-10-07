import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { GatewayError, gatewayMint } from "@/lib/server/gateway";
import { KeyUnavailable } from "@/lib/server/arc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a sponsor's Gateway balance on Arc. Body `{ burnIntent, signature }`
 * (burnIntent as lib/gateway.ts `burnIntentToJson`). The intent is checked,
 * its signature must recover the depositor, Circle's Gateway API attests it,
 * and the relayer calls GatewayMinter.gatewayMint on Arc, paying the gas in
 * USDC. Answers `{ transaction, recipient, value }`.
 */
async function handlePOST(req: Request) {
  const gate = rateLimit(`gateway-mint:${callerKey(req)}`, 6, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    return NextResponse.json(await gatewayMint(body));
  } catch (e) {
    if (e instanceof GatewayError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof KeyUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "the mint failed" }, { status: 502 });
  }
}

export const POST = logged("/api/gateway/mint", handlePOST);
