import { NextResponse } from "next/server";
import { PRIOR_CHAINS } from "@/lib/chain";
import { trajectoriesOnChain } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs recorded while this deployment settled on an earlier chain. Kept
 *  separate from /api/feed so nothing can render them as current. */
export async function GET() {
  const chains = PRIOR_CHAINS.map((c) => ({
    id: c.id, name: c.name, explorer: c.explorer, currency: c.currency,
    runs: trajectoriesOnChain(c.id),
  })).filter((c) => c.runs.length > 0);

  return NextResponse.json({
    total: chains.reduce((n, c) => n + c.runs.length, 0),
    chains,
  });
}
