import { NextResponse } from "next/server";
import { trajectoriesForTask } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json({ error: "task id must be a non-negative integer" }, { status: 400 });
  }
  return NextResponse.json({ taskId: n, runs: trajectoriesForTask(n) });
}
