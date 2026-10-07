import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { GatewayError, gatewayBalances } from "@/lib/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A depositor's Circle Gateway balance on every source chain, from Circle's Gateway API. USDC base units. */
async function handleGET(req: Request) {
  try {
    return NextResponse.json(await gatewayBalances(new URL(req.url).searchParams.get("address")));
  } catch (e) {
    const status = e instanceof GatewayError ? (e.status === 400 ? 400 : 502) : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Circle Gateway could not be read" }, { status });
  }
}

export const GET = logged("/api/gateway/balance", handleGET);
