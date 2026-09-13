import { NextResponse } from "next/server";
import { logged, logLine } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * World ID failures that never reach this server on their own.
 *
 * The widget talks to World App through World's bridge, so a Selfie Check can
 * fail entirely in the browser — a blocked connection, a missing credential, a
 * cancelled prompt — and leave nothing in the logs. The station reports the
 * error code here, so a failure an operator saw is one someone else can read.
 */
async function handlePOST(req: Request) {
  const gate = rateLimit(`world-report:${callerKey(req)}`, 20, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many reports." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { code?: unknown; address?: unknown } | null;
  const code = typeof body?.code === "string" && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : null;
  if (!code) return NextResponse.json({ error: "code must be an IDKit error code" }, { status: 400 });
  const address =
    typeof body?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.address) ? body.address.toLowerCase() : "unknown";

  logLine("warn", "world_client_error", { code, address });
  return new NextResponse(null, { status: 204 });
}

export const POST = logged("/api/world/report", handlePOST);
