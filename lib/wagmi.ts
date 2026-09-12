import { fallback, http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { appChain, RPC_ENDPOINTS } from "./chain";

/**
 * wagmi, with Privy supplying the wallet.
 *
 * Privy's createConfig takes no connectors. The wallet an operator uses is the
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
   * The secondaries are not equivalent, and pretending they were would trade a
   * dead endpoint for a live one that returns nothing: they refuse the wide log
   * ranges this app reads history with. That is handled where it belongs, in
   * lib/scan-logs.ts, which narrows a range until whoever is answering accepts
   * it — so failing over costs more round trips and no correctness.
   */
  transports: {
    [appChain.id]: fallback(
      RPC_ENDPOINTS.map((url) =>
        http(url, {
          batch: true,        // one round trip for a screen full of reads
          // One retry, not three. A public endpoint answers a burst with 429,
          // and retrying the same one is asking the thing that just refused —
          // there are two others, and moving on is both faster and quieter.
          retryCount: 1,
          retryDelay: 300,
        }),
      ),
      { rank: false },        // in order: the first is the one that answers widest
    ),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
