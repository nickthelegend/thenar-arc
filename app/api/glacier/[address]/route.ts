import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { settlementsFor } from "@/lib/glacier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An address's settlement history, straight from Avalanche's indexer. This
 *  route touches no database — it is the path that still works if ours is gone. */
export async function GET(_: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Not an address." }, { status: 400 });
  }
  try {
    const settlements = await settlementsFor(address);
    return NextResponse.json({ source: "glacier", address, settlements });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Glacier is unreachable." },
      { status: 502 },
    );
  }
}
