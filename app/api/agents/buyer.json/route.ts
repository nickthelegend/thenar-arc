import { NextResponse } from "next/server";
import { registrationFile } from "@/lib/server/agent-card";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The registration file for a buying agent (scripts/agent-buy.mjs,
 * scripts/qwen-agent.mjs): an agent that buys task corpora over x402 in USDC
 * on Arc, names itself with `x-erc8004-agent-id`, and rates the verifier after
 * each purchase. `?agentId=` fills its registration.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("agentId");
  return NextResponse.json(
    registrationFile({
      name: "Thenar corpus buyer",
      description:
        "Buys robot-arm trajectory corpora from Thenar per request over x402 (EIP-3009 USDC on Arc), checks each file's " +
        "sha256 against SalesLog, and rates the verifier on the ERC-8004 Reputation Registry (tag corpusQuality).",
      agentId: q ?? process.env.AGENT_ID,
      services: [{ name: "buys", endpoint: AGENT_CORPUS.path, version: "x402-v2" }],
    }),
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
