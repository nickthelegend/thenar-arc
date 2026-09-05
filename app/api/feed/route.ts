import { NextResponse } from "next/server";
import { countTrajectories, recentTrajectories } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20);
  return NextResponse.json({
    total: countTrajectories(),
    runs: recentTrajectories(limit),
  });
}
