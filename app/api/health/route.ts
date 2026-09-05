import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { AXON_ADDRESS, IS_DEPLOYED, monadTestnet } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { countTrajectories } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: monadTestnet, transport: http() });

/** Everything that has to be true for a run to be recordable. */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  checks.verifierKey = {
    ok: Boolean(process.env.VERIFIER_PRIVATE_KEY),
    detail: process.env.VERIFIER_PRIVATE_KEY ? "configured" : "VERIFIER_PRIVATE_KEY is not set",
  };

  checks.contract = {
    ok: IS_DEPLOYED,
    detail: IS_DEPLOYED ? AXON_ADDRESS : "NEXT_PUBLIC_AXON_ADDRESS is not set",
  };

  try {
    const n = countTrajectories();
    checks.database = { ok: true, detail: `${n} trajectories stored` };
  } catch (e) {
    checks.database = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
  }

  try {
    const block = await client.getBlockNumber();
    checks.rpc = { ok: true, detail: `block ${block}` };
  } catch (e) {
    checks.rpc = { ok: false, detail: e instanceof Error ? e.message : "unreachable" };
  }

  if (IS_DEPLOYED) {
    try {
      const onchainVerifier = await client.readContract({
        address: AXON_ADDRESS, abi: AXON_ABI, functionName: "verifier",
      });
      const expected = process.env.VERIFIER_ADDRESS?.toLowerCase();
      const actual = String(onchainVerifier).toLowerCase();
      checks.verifierMatches = {
        ok: !expected || expected === actual,
        detail: expected === actual ? "server key matches the contract" : `contract expects ${actual}`,
      };
    } catch (e) {
      checks.verifierMatches = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
