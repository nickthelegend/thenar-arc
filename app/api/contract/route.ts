import { NextResponse } from "next/server";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, USDC, USDC_DECIMALS, appChain } from "@/lib/chain";
import { EXTERNAL_CONTRACTS, LIVE_CONTRACTS, SUPERSEDED } from "@/lib/registry";

export const runtime = "nodejs";

/**
 * Everything needed to talk to Thenar without reading the source.
 *
 * That was true of the protocol contract and of nothing else: the other
 * contracts are deployed and this endpoint did not mention them, so a consumer
 * taking it at its word would not know the verdicts, the sales log or the
 * CCIP receiver existed. The protocol contract keeps the
 * top-level fields it always had, so nothing that reads this breaks; the rest
 * are added alongside.
 */
export async function GET() {
  return NextResponse.json({
    name: "ThenarProtocol",
    deployed: IS_DEPLOYED,
    address: IS_DEPLOYED ? AXON_ADDRESS : null,
    chain: {
      id: appChain.id,
      name: appChain.name,
      rpc: appChain.rpcUrls.default.http[0],
      explorer: appChain.blockExplorers.default.url,
      currency: appChain.nativeCurrency.symbol,
      gas: "USDC (native, 18 decimals)",
    },
    // Every amount in the ABI (escrow, reward, payout, licence fee) is in this token's base units.
    amounts: { token: USDC, symbol: "USDC", decimals: USDC_DECIMALS },
    verifier: process.env.VERIFIER_ADDRESS ?? null,
    abi: AXON_ABI,
    contracts: LIVE_CONTRACTS.map((c) => ({
      name: c.name,
      address: c.address,
      does: c.does,
      source: c.source,
      surface: c.surface,
      ...(c.arc ? { arc: c.arc } : {}),
    })),
    external: EXTERNAL_CONTRACTS.map((c) => ({ name: c.name, address: c.address, does: c.does })),
    superseded: SUPERSEDED.map((c) => ({
      name: c.name, address: c.address, does: c.does, source: c.source,
    })),
    registry: "https://app.thenar.io/contracts",
  });
}
