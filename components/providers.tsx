"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { TasksProvider } from "@/components/tasks-provider";
import { ModelStageProvider } from "@/components/model-stage";
import { Palette } from "@/components/palette";
import { wagmiConfig } from "@/lib/wagmi";
import { appChain } from "@/lib/chain";

// The modal is the one surface we do not draw ourselves, so it is pulled onto
// the product's palette rather than left on RainbowKit's default purple.
const theme = darkTheme({
  accentColor: "#FF6A00",
  accentColorForeground: "#000000",
  borderRadius: "none",
  fontStack: "system",
  overlayBlur: "small",
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain state changes every block; a second of staleness is fine
            // and it keeps a screen full of reads off the RPC's rate limit.
            staleTime: 2_000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} initialChain={appChain} modalSize="compact">
          <TasksProvider>
          <ModelStageProvider>{children}<Palette /></ModelStageProvider>
          </TasksProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
