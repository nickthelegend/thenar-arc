import { createConfig, http, type Transport } from "wagmi";
import { injected } from "wagmi/connectors";
import { RPC_ENDPOINTS, appChain } from "./chain";
import { localWallet } from "./local-wallet";

/**
 * wagmi on the local Arc fork: the browser-held local wallet first, and any
 * browser wallet pointed at the fork after it. No Privy, which cannot see a
 * chain on this machine.
 */
export const localWagmiConfig = createConfig({
  chains: [appChain],
  connectors: [localWallet(), injected()],
  transports: { [appChain.id]: http(RPC_ENDPOINTS[0], { batch: true }) } as Record<typeof appChain.id, Transport>,
  ssr: true,
});
