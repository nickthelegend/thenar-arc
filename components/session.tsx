"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { LOCALNET, appChain } from "@/lib/chain";
import { formatNative } from "@/lib/usdc";

/**
 * The operator's wallet, as the rest of the app sees it.
 *
 * Signing in is Privy's: an email address becomes an embedded wallet on Arc, or
 * an operator who already has a wallet connects it through the same modal. From
 * there it is wagmi as before — the address is the wallet Privy hands over, the
 * balance comes from the chain's RPC, and there is no local shadow of either. If
 * the chain says the balance is zero, the UI says zero.
 *
 * `balance` is USDC: Arc's native balance is USDC at 18 decimals (the same
 * dollars the USDC ERC-20 reports at 6), so the one number is both what the
 * wallet holds and what it has for gas. `balanceWei` is that native value
 * unconverted (18 decimals), for comparisons that must not round.
 */
function usePrivySession() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, isConnected, chainId, status } = useAccount();
  const { error: connectError } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const { data: bal, refetch: refetchBalance } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  });

  const connect = useCallback(() => login(), [login]);
  const disconnect = useCallback(() => { void logout(); }, [logout]);

  const wrongNetwork = isConnected && chainId !== appChain.id;

  const balance = useMemo(() => (bal ? Number(formatNative(bal.value)) : 0), [bal]);

  return {
    address: address ?? null,
    balance,
    balanceWei: bal?.value ?? 0n,
    connected: isConnected,
    // Privy restores a session asynchronously on load, and a new operator's
    // wallet exists only a moment after they sign in. Until the wallet has
    // reached wagmi, the true answer is "connecting", not "not connected".
    connecting:
      !ready || (authenticated && !isConnected) || status === "connecting" || status === "reconnecting",
    connectError,
    wrongNetwork,
    switching,
    connect,
    disconnect,
    switchToChain: () => switchChain({ chainId: appChain.id }),
    refetchBalance,
  };
}

/**
 * The same session on the local Arc fork, where there is no Privy: the local
 * wallet this browser holds (lib/local-wallet.ts). Signing in connects it and
 * asks the fork's faucet for USDC, which is its gas and its money at once, as
 * an operator on Arc testnet would ask Circle's faucet.
 */
function useLocalSession(): ReturnType<typeof usePrivySession> {
  const queryClient = useQueryClient();
  const { address, isConnected, chainId, status } = useAccount();
  const { connectAsync, connectors, error: connectError, isPending } = useConnect();
  const { disconnect: end } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal, refetch: refetchBalance } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 4_000 },
  });

  const connect = useCallback(async () => {
    const connector = connectors.find((c) => c.id === "thenarLocal") ?? connectors[0];
    try {
      const { accounts } = await connectAsync({ connector });
      await fetch("/api/localnet/fund", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: accounts[0] }),
      });
      // Every balance on the page has just changed: re-read them all now rather
      // than at the next poll, which a background tab may never reach.
      void queryClient.invalidateQueries();
      void refetchBalance();
    } catch (e) {
      console.error("The local wallet did not connect", e);
    }
  }, [connectors, connectAsync, refetchBalance, queryClient]);

  const balance = useMemo(() => (bal ? Number(formatNative(bal.value)) : 0), [bal]);

  return {
    address: address ?? null,
    balance,
    balanceWei: bal?.value ?? 0n,
    connected: isConnected,
    connecting: isPending || status === "connecting" || status === "reconnecting",
    connectError,
    wrongNetwork: isConnected && chainId !== appChain.id,
    switching,
    connect: connect as () => void,
    disconnect: () => end(),
    switchToChain: () => switchChain({ chainId: appChain.id }),
    refetchBalance,
  };
}

/** Chosen once, at build time, so every render calls the same hooks. */
export const useSession = LOCALNET ? useLocalSession : usePrivySession;
