import { createPublicClient, fallback, http } from "viem";
import { appChain, RPC_ENDPOINTS } from "./chain";

/**
 * One chain client, asking more than one endpoint.
 *
 * Ten modules built their own with `http()` and no argument, which is the
 * chain's first declared endpoint and nothing else. Every one of them — the
 * contract registry, the health check, the manifest, the signer's own
 * verification — went dark together whenever that endpoint rate-limited, and
 * since the API backend went away the chain is the only half of this product
 * still answering.
 *
 * The order is not arbitrary and the endpoints are not equivalent: see
 * RPC_ENDPOINTS. Where a caller reads history rather than state, it goes
 * through lib/scan-logs.ts, which is what makes a narrower endpoint a slower
 * answer rather than a wrong one.
 */
export function chainClient() {
  return createPublicClient({
    chain: appChain,
    // Arc produces a block in well under a second and it is final when it is
    // produced; viem's default four-second poll would add seconds to every
    // receipt wait (an x402 settlement, a SalesLog write) for nothing.
    pollingInterval: 500,
    transport: fallback(
      RPC_ENDPOINTS.map((url) => http(url, { retryCount: 2, retryDelay: 400 })),
      { rank: false },
    ),
  });
}
