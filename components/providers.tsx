"use client";

import { Suspense, useEffect } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { TasksProvider } from "@/components/tasks-provider";
import { ModelStageProvider } from "@/components/model-stage";
import { Palette } from "@/components/palette";
import { Tour } from "@/components/tour";
import { wagmiConfig } from "@/lib/wagmi";
import { appChain } from "@/lib/chain";

/**
 * The modal is the one surface we do not draw ourselves, so it is pulled onto
 * the product's palette rather than left on RainbowKit's default purple.
 *
 * Both grounds, because the product has both. This was a single dark theme
 * accented #FF6A00 — the orange the rest of the product has discarded — which
 * meant the one screen a first-time operator has to get through to be paid was
 * still wearing the old identity, on the wrong ground, after everything else
 * had moved.
 */
const shared = { borderRadius: "none", fontStack: "system", overlayBlur: "small" } as const;
const lightModal = lightTheme({ ...shared, accentColor: "#2B50E0", accentColorForeground: "#EFEFEE" });
const darkModal = darkTheme({ ...shared, accentColor: "#7C97FF", accentColorForeground: "#0D0D0F" });

/**
 * Which ground the wallet modal should be drawn on.
 *
 * The theme lives on a data attribute written before first paint, so it is read
 * from the DOM rather than from React state that does not exist yet, and it
 * follows the toggle: opening the modal, switching the theme behind it and
 * looking again should not show the other product's colours.
 */
function useModalTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark ? darkModal : lightModal;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const modalTheme = useModalTheme();
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
        <RainbowKitProvider theme={modalTheme} initialChain={appChain} modalSize="compact">
          <TasksProvider>
          <ModelStageProvider>
            {children}
            <Palette />
            {/* The tour reads its step from the query string, and a component
                that reads search params cannot be prerendered — without this
                boundary the 404 page fails to build. Nothing renders here
                until a ?tour= is present, so an empty fallback is the whole
                fallback. */}
            <Suspense fallback={null}>
              <Tour />
            </Suspense>
          </ModelStageProvider>
          </TasksProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
