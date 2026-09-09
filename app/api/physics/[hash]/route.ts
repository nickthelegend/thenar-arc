import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { getTrajectory } from "@/lib/server/db";
import { settleFrom } from "@/lib/server/physics";
import type { Sample } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The engine is eight megabytes of WebAssembly and the integration runs to
// twelve simulated seconds; the default budget is not enough for the first
// call on a cold container.
export const maxDuration = 60;

/**
 * How far one recorded run is from what physics would have done.
 *
 * Read-only and scoring-free. The payout stands on the recording; this reports
 * the gap between that recording and rigid-body dynamics, which is a thing a
 * buyer of the corpus should be able to ask rather than take on trust.
 */
async function handleGET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ error: "hash must be a 32-byte value" }, { status: 400 });
  }

  const row = await getTrajectory(hash);
  if (!row) return NextResponse.json({ error: "No trajectory with that hash." }, { status: 404 });

  const samples = JSON.parse(row.samples) as Sample[];
  const settled = await settleFrom(samples);
  if (!settled) {
    return NextResponse.json(
      { error: "This run never released the payload, so there is nothing to integrate." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    trajHash: hash,
    engine: "MuJoCo 3.1.16, WebAssembly",
    note:
      "The station is a kinematic simulator. This integrates the same release " +
      "state under rigid-body dynamics and reports the difference. It scores " +
      "nothing and changes no payout.",
    ...settled,
  });
}

export const GET = logged("/api/physics/[hash]", handleGET);
