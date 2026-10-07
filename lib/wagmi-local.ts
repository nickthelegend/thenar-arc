import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { LOCAL_RPC, thenarLocalnet } from "./chain";
import { localWallet } from "./local-wallet";

/**
 * wagmi on the local Arc fork: the browser-held local wallet first, and any
 * browser wallet pointed at the fork after it. No Privy, which cannot see a
 * chain on this machine.
 */
export const localWagmiConfig = createConfig({
  chains: [thenarLocalnet],
  connectors: [localWallet(), injected()],
  transports: { [thenarLocalnet.id]: http(LOCAL_RPC, { batch: true }) },
  ssr: true,
});
