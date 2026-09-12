import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { HumanError, humanFor, requestFor } from "@/lib/server/world-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Is this operator address already backed by a verified human? */
async function handleGET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!ADDRESS.test(address)) return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  const human = await humanFor(address);
  return NextResponse.json({
    address: address.toLowerCase(),
    human: human
      ? { credential: human.credential, protocol: human.protocol, environment: human.environment, verifiedAt: human.verified_at }
      : null,
  });
}

/** Sign a fresh Selfie Check request for one operator address. */
async function handlePOST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (typeof address !== "string" || !ADDRESS.test(address)) {
    return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  }
  try {
    return NextResponse.json(await requestFor(address));
  } catch (e) {
    if (e instanceof HumanError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const GET = logged("/api/world/request", handleGET);
export const POST = logged("/api/world/request", handlePOST);
