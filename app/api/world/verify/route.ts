import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { getAddress, isHex, verifyMessage } from "viem";
import type { IDKitResult } from "@worldcoin/idkit-core";
import { HumanError, verifyHuman } from "@/lib/server/world-id";
import { admitHuman, refusal, TokenError } from "@/lib/server/ats";
import { bindingMessage } from "@/lib/world";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn a Selfie Check into a contributor.
 *
 * Two statements have to agree before anything is recorded: World's, that a
 * live human made this proof for this address, and the wallet's, that the
 * address wants it. Then the Hedera side follows — the human is put on the
 * corpus security's whitelist, which is what lets them hold the shares their
 * runs earn.
 *
 * The admission is reported, not assumed. If Hedera refuses or is unreachable
 * the proof still stands, and the response says the whitelist step did not
 * happen and why.
 */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { address?: string; result?: IDKitResult; signature?: string }
    | null;
  const { address, result, signature } = body ?? {};

  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  }
  if (typeof signature !== "string" || !isHex(signature)) {
    return NextResponse.json({ error: "The wallet did not sign the binding." }, { status: 400 });
  }
  if (!result || typeof result !== "object" || typeof result.nonce !== "string") {
    return NextResponse.json({ error: "No proof was sent." }, { status: 400 });
  }

  const walletAgrees = await verifyMessage({
    address: getAddress(address),
    message: bindingMessage(address, result.nonce),
    signature,
  }).catch(() => false);
  if (!walletAgrees) {
    return NextResponse.json({ error: "The signature does not come from this address." }, { status: 401 });
  }

  let human;
  try {
    human = await verifyHuman(address, result);
  } catch (e) {
    if (e instanceof HumanError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let security: { admitted: boolean; already?: boolean; tx?: string | null; error?: string };
  try {
    const admission = await admitHuman(getAddress(address), human.nullifier);
    security = { admitted: true, already: admission.already, tx: admission.tx };
  } catch (e) {
    const rule = refusal(e);
    security = {
      admitted: false,
      error: e instanceof TokenError ? e.message : rule ? `The security refused: ${rule}` : e instanceof Error ? e.message : "unknown",
    };
  }

  return NextResponse.json({
    human: {
      address: human.address,
      credential: human.credential,
      protocol: human.protocol,
      environment: human.environment,
      verifiedAt: human.verified_at,
    },
    security,
  });
}

export const POST = logged("/api/world/verify", handlePOST);
