"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useBalance, useConnect, useSwitchChain } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { appChain } from "@/lib/chain";

/**
 * The operator's wallet, as the rest of the app sees it.
 *
 * Signing in is Privy's: an email address becomes an embedded wallet on Arc, or
 * an operator who already has a wallet connects it through the same modal. From
 * there it is wagmi as before — the address is the wallet Privy hands over, the
 * balance comes from the chain's RPC, and there is no local shadow of either. If
 * the chain says the balance is zero, the UI says zero.
 */
export function useSession() {
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

  const balance = useMemo(() => (bal ? Number(bal.value) / 1e18 : 0), [bal]);

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
