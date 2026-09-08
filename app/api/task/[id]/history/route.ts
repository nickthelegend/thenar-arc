import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { funderHistory } from "@/lib/glacier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What has happened around a task, from Avalanche's own index.
 *
 * The funder is passed in rather than looked up: the contract already told the
 * page who it is, and re-reading it here would be a second RPC call to learn
 * something the caller knows.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }

  const funder = new URL(req.url).searchParams.get("funder");
  if (!funder || !isAddress(funder)) {
    return NextResponse.json({ error: "funder must be an address" }, { status: 400 });
  }

  try {
    return NextResponse.json({ taskId, funder, history: await funderHistory(funder) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Avalanche's index is unreachable." },
      { status: 502 },
    );
  }
}
