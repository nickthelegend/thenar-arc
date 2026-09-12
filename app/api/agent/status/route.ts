import { NextResponse } from "next/server";
import { createAgentBookVerifier } from "@worldcoin/agentkit-core";
import { logged } from "@/lib/server/log";
import { query } from "@/lib/server/sql";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const book = createAgentBookVerifier();

/**
 * Whether World's AgentBook maps an agent wallet to a verified human, asked of
 * World Chain at the moment of the request.
 *
 * The same lookup the corpus paywall makes before granting a free pull, so
 * what this says is what the paywall will do. The human id is AgentBook's own
 * anonymous identifier; it names nobody.
 */
async function handleGET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "address must be a 20-byte hex address" }, { status: 400 });
  }

  let humanId: string | null;
  try {
    humanId = await book.lookupHuman(address);
  } catch (e) {
    return NextResponse.json(
      { error: `World Chain could not be read: ${e instanceof Error ? e.message.split("\n")[0] : "unknown error"}` },
      { status: 502 },
    );
  }

  // No row means this human has taken no free pulls yet, which is zero.
  const used = humanId
    ? Number(
        (await query<{ uses: number }>(
          `SELECT uses FROM agentkit_usage WHERE endpoint = ? AND human_id = ?`,
          [AGENT_CORPUS.path, humanId],
        ))[0]?.uses ?? 0,
      )
    : null;

  return NextResponse.json({
    address,
    agentBook: AGENT_CORPUS.agentBook,
    registered: humanId !== null,
    humanId,
    freePulls: humanId ? { used, of: AGENT_CORPUS.freeUses } : null,
    register: `npx @worldcoin/agentkit-cli register ${address}`,
  });
}

export const GET = logged("/api/agent/status", handleGET);
