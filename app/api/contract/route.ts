import { NextResponse } from "next/server";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { DEPLOYED, SUPERSEDED } from "@/lib/registry";

export const runtime = "nodejs";

/**
 * Everything needed to talk to Thenar without reading the source.
 *
 * That was true of the protocol contract and of nothing else: ten other
 * contracts are deployed and this endpoint did not mention them, so a consumer
 * taking it at its word would not know the Warp attestation, the confidential
 * payouts or the referral pot existed. The protocol contract keeps the
 * top-level fields it always had, so nothing that reads this breaks; the rest
 * are added alongside.
 */
export async function GET() {
  return NextResponse.json({
    name: "AxonProtocol",
    deployed: IS_DEPLOYED,
    address: IS_DEPLOYED ? AXON_ADDRESS : null,
    chain: {
      id: appChain.id,
      name: appChain.name,
      rpc: appChain.rpcUrls.default.http[0],
      explorer: appChain.blockExplorers.default.url,
      currency: appChain.nativeCurrency.symbol,
    },
    verifier: process.env.VERIFIER_ADDRESS ?? null,
    abi: AXON_ABI,
    contracts: DEPLOYED.map((c) => ({
      name: c.name,
      address: c.address,
      does: c.does,
      source: c.source,
      surface: c.surface,
      ...(c.avalanche ? { avalanche: c.avalanche } : {}),
    })),
    superseded: SUPERSEDED.map((c) => ({
      name: c.name, address: c.address, does: c.does, source: c.source,
    })),
    registry: "https://thenar.io/contracts",
  });
}
