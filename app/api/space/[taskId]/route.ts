import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { place, roster, leave } from "@/lib/server/space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const taskOf = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Everyone else working this task right now. */
export async function GET(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const taskId = taskOf((await ctx.params).taskId);
  if (taskId === null) return NextResponse.json({ error: "Bad task id." }, { status: 400 });
  const me = new URL(req.url).searchParams.get("me") ?? undefined;
  return NextResponse.json({ taskId, operators: roster(taskId, me) });
}

/** Report where this operator's tool is. */
export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const taskId = taskOf((await ctx.params).taskId);
  if (taskId === null) return NextResponse.json({ error: "Bad task id." }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad body." }, { status: 400 }); }

  const b = body as { id?: unknown; tool?: unknown; grip?: unknown; held?: unknown };
  // An address is the only id that means anything to anyone else in the room.
  if (typeof b.id !== "string" || !isAddress(b.id)) {
    return NextResponse.json({ error: "id must be an address." }, { status: 400 });
  }
  const tool = b.tool;
  if (!Array.isArray(tool) || tool.length !== 3 || !tool.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return NextResponse.json({ error: "tool must be three finite numbers." }, { status: 400 });
  }
  const grip = typeof b.grip === "number" && Number.isFinite(b.grip) ? b.grip : 0;

  place(taskId, {
    id: b.id,
    tool: tool as [number, number, number],
    grip,
    held: Boolean(b.held),
  });

  return NextResponse.json({ operators: roster(taskId, b.id) });
}

/** Leave the room without waiting to go stale. */
export async function DELETE(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const taskId = taskOf((await ctx.params).taskId);
  if (taskId === null) return NextResponse.json({ error: "Bad task id." }, { status: 400 });
  const me = new URL(req.url).searchParams.get("me");
  if (me) leave(taskId, me);
  return NextResponse.json({ ok: true });
}
