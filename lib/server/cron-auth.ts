import "server-only";
import { NextResponse } from "next/server";
import { LOCALNET } from "@/lib/chain";

/**
 * The guard on a scheduled route: the reconciler, the snapshot and its drill.
 *
 * They used to open themselves to anyone whenever CRON_SECRET was unset, and
 * in production it was unset, so any visitor could make the reconciler write
 * to the ledger or make the drill read the whole corpus back out of the
 * bucket. Now an unset secret closes them instead, except on a local chain,
 * where there is nobody else to keep out.
 *
 * Returns the refusal to send, or null when the caller may proceed.
 */
export function cronRefusal(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (LOCALNET) return null;
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so this scheduled route is closed." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  return null;
}
