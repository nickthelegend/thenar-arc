import { createConfig, fallback, http, type Transport } from "wagmi";
import { appChain, RPC_ENDPOINTS } from "./chain";

/** No connectors or persisted session: missing auth can read, never sign or restore a wallet. */
export const readonlyWagmiConfig = createConfig({
  chains: [appChain],
  connectors: [],
  storage: null,
  transports: { [appChain.id]: fallback(RPC_ENDPOINTS.map(url => http(url, { batch: true, retryCount: 1 }))) } as Record<typeof appChain.id, Transport>,
  // wagmi 2 requires persisted storage when ssr=true; this mode has none.
  ssr: false,
  multiInjectedProviderDiscovery: false,
});
