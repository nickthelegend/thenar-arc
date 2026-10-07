import { fallback, http, type Transport } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { appChain, RPC_ENDPOINTS } from "./chain";

/**
 * wagmi on Arc, with Privy supplying the wallet.
 *
 * The one chain is `appChain` (Arc testnet, or Arc mainnet in a mainnet
 * build), whose native currency is USDC. Privy's createConfig takes no connectors. The wallet an operator uses is the
 * one Privy hands wagmi after sign-in — an embedded wallet made from an email
 * address, or a wallet they already had and connected through Privy's modal —
 * so every hook the station, the task pages and the passkey flow already use
 * keeps working against it unchanged.
 */
export const wagmiConfig = createConfig({
  chains: [appChain],
  /**
   * More than one endpoint, because the chain half is the half that works.
   *
   * Every read on this site went to a single public RPC. If it rate-limited or
   * went down, the standings, the task list, the escrow figures and the
   * contract registry all went with it — and since the API backend went away,
   * the chain is the only thing still answering.
   *
   * An operator can set NEXT_PUBLIC_ARC_RPC to a provider of their own; a
   * secondary that refuses a wide log range is handled in lib/scan-logs.ts,
   * which narrows a range until whoever is answering accepts it.
   */
  transports: {
    [appChain.id]: fallback(
      RPC_ENDPOINTS.map((url) =>
        http(url, {
          batch: true,        // one round trip for a screen full of reads
          // One retry, not three. A public endpoint answers a burst with 429,
          // and retrying the same one is asking the thing that just refused.
          retryCount: 1,
          retryDelay: 300,
        }),
      ),
      { rank: false },        // in order: the first is the one that answers widest
    ),
  } as Record<typeof appChain.id, Transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
