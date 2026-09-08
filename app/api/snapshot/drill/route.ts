import { NextResponse } from "next/server";
import { drill } from "@/lib/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Restore today's backup and report whether it is intact.
 *
 * Same guard as the snapshot itself: it reads the whole corpus back out of the
 * bucket, so it is worth a secret when one is configured.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const stamp = new URL(req.url).searchParams.get("stamp")
    ?? new Date().toISOString().slice(0, 10);

  try {
    const result = await drill(stamp);
    const ok = result.integrity === "ok" && result.matchesLive && result.withSamples === result.trajectories;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Drill failed." },
      { status: 500 },
    );
  }
}
