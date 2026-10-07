import { NextResponse } from "next/server";
import { occupancy } from "@/lib/server/space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which rooms have anyone in them. */
export async function GET() {
  const rooms = occupancy();
  return NextResponse.json({
    rooms,
    operators: rooms.reduce((n, r) => n + r.operators, 0),
  });
}
