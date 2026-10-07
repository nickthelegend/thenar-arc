import { NextResponse } from "next/server";
import { countTrajectories, recentTrajectories, trajectoriesByContributor } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // A whole number from 1 to 50, whatever was sent: "-1" reached Postgres as
  // LIMIT -1 and "2.5" as LIMIT 2.5, and both answered with a bare 500.
  const asked = Math.trunc(Number(new URL(req.url).searchParams.get("limit") ?? 20));
  const limit = Number.isFinite(asked) && asked >= 1 ? Math.min(50, asked) : 20;
  // One operator's runs, all of them: their page used to filter the fifty
  // newest network-wide, so anyone with older runs lost them there.
  const contributor = new URL(req.url).searchParams.get("contributor");
  if (contributor !== null) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(contributor)) {
      return NextResponse.json({ error: "contributor must be an address" }, { status: 400 });
    }
    const runs = await trajectoriesByContributor(contributor);
    return NextResponse.json({ total: runs.length, runs });
  }
  return NextResponse.json({
    total: await countTrajectories(),
    runs: await recentTrajectories(limit),
  });
}
