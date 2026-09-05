import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { monadTestnet } from "./chain";

// WalletConnect-backed wallets need a project id. Without one they would open a
// modal that can never pair, so they are only offered when the id is present.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const walletConnectGroup = projectId
  ? [{ groupName: "More", wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet] }]
  : [];

const connectors = connectorsForWallets(
  [
    { groupName: "Installed", wallets: [injectedWallet, coinbaseWallet] },
    ...walletConnectGroup,
  ],
  { appName: "Thenar", projectId },
);

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors,
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0], {
      batch: true,          // one round trip for a screen full of reads
      retryCount: 3,
      retryDelay: 400,
    }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
