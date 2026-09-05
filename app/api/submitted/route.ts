import { NextResponse } from "next/server";
import { markSubmitted } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { trajHash, txHash } = await req.json();
    if (!/^0x[0-9a-fA-F]{64}$/.test(trajHash ?? "")) {
      return NextResponse.json({ error: "trajHash must be a 32-byte hash" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash ?? "")) {
      return NextResponse.json({ error: "txHash must be a 32-byte hash" }, { status: 400 });
    }
    markSubmitted(trajHash, txHash);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "could not record the transaction" }, { status: 500 });
  }
}
