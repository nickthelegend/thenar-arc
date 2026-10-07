import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { complianceCheck, corpusSecurity, holderView, TokenError } from "@/lib/server/corpus-shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The corpus shares, read from CorpusShares on Monad.
 *
 *   GET /api/tokenize                  the security: supply, whitelist, dividends, the log
 *   GET /api/tokenize?address=0x…      one holder: listed, shares, dividends owed, and
 *                                      whether the security would accept a share for them
 */
async function handleGET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  try {
    if (address) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return NextResponse.json({ error: "address must be an address" }, { status: 400 });
      }
      const who = getAddress(address);
      const [holder, compliance] = await Promise.all([holderView(who), complianceCheck(who)]);
      return NextResponse.json({ address: who, ...holder, compliance });
    }
    const security = await corpusSecurity();
    if (!security) {
      return NextResponse.json({ error: "CorpusShares is not deployed yet." }, { status: 503 });
    }
    return NextResponse.json(security);
  } catch (e) {
    if (e instanceof TokenError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const GET = logged("/api/tokenize", handleGET);
