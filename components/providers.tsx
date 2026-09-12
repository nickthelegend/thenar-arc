"use client";

import { Suspense, useEffect, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { TasksProvider } from "@/components/tasks-provider";
import { ModelStageProvider } from "@/components/model-stage";
import { Palette } from "@/components/palette";
import { Tour } from "@/components/tour";
import { wagmiConfig } from "@/lib/wagmi";
import { appChain } from "@/lib/chain";

/**
 * The Privy app operators sign in through.
 *
 * Required rather than optional. Without it nobody can sign in, and a site that
 * rendered anyway would show a Connect button that does nothing — so a missing
 * id fails loudly here instead of quietly everywhere.
 */
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
if (!PRIVY_APP_ID) {
  throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set. Operators sign in through Privy; see .env.example.");
}

/**
 * Which ground the sign-in modal should be drawn on.
 *
 * The theme lives on a data attribute written before first paint, so it is read
 * from the DOM rather than from React state that does not exist yet, and it
 * follows the toggle: opening the modal, switching the theme behind it and
 * looking again should not show the other product's colours.
 */
function useDarkGround() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const dark = useDarkGround();
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
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        // An email address is enough to be paid: Privy makes the wallet. An
        // operator who already has one can still bring it.
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: dark ? "dark" : "light",
          accentColor: dark ? "#7C97FF" : "#2B50E0",
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: appChain,
        supportedChains: [appChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
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
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
