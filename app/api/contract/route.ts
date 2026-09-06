import { NextResponse } from "next/server";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";

export const runtime = "nodejs";

/** Everything needed to talk to Thenar without reading the source. */
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
  });
}
