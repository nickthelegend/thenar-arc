import { NextResponse } from "next/server";
import { snapshot } from "@/lib/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly copy of the corpus, off the volume that holds it.
 *
 * Guarded when CRON_SECRET is set. It is a read of the database and a write to
 * private storage, so an unsolicited call costs an object, not a disclosure —
 * but the object is the whole corpus, so it is worth the guard.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Date only: one snapshot a day, and re-running replaces rather than piles up.
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const result = await snapshot(stamp);
    return NextResponse.json(result, { status: result.uploaded ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed." },
      { status: 500 },
    );
  }
}
