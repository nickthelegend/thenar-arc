import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { trajectoryByTx } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The run a settlement transaction paid for: { trajHash } or 404. Lets a link by tx hash land on the run. */
async function handleGET(_req: Request, ctx: { params: Promise<{ tx: string }> }) {
  const { tx } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  const trajHash = await trajectoryByTx(tx);
  return trajHash ? NextResponse.json({ trajHash }) : NextResponse.json({ error: "no run was paid by that transaction" }, { status: 404 });
}

export const GET = logged("/api/trajectory/by-tx", handleGET);
