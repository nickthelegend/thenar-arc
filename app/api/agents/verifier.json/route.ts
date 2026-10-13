import { NextResponse } from "next/server";
import { registrationFile } from "@/lib/server/agent-card";
import { verifierStatus } from "@/lib/server/erc8004";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thenar's verifier as an ERC-8004 agent: the file its agentURI names. */
export async function GET() {
  const v = await verifierStatus().catch(() => null);
  return NextResponse.json(
    registrationFile({
      name: "Thenar verifier",
      description:
        "Scores robot-arm teleoperation recordings and signs the EIP-712 verdict ThenarProtocol pays against, in USDC on Arc. " +
        "Once this agent is registered and bound, every paid verdict is written to the ERC-8004 Reputation Registry (tag runVerdict) by ThenarVerdicts; " +
        "buying agents rate the corpus they bought (tag corpusQuality).",
      agentId: v?.agentId ?? process.env.VERIFIER_AGENT_ID,
      services: [
        { name: "web", endpoint: "/" },
        { name: "verify", endpoint: "/api/verify", version: "1" },
        { name: "corpus-x402", endpoint: AGENT_CORPUS.path, version: "x402-v2" },
        { name: "arc", endpoint: "/api/arc" },
      ],
    }),
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
