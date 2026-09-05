"use client";

import { useCallback, useMemo } from "react";
import {
  useAccount, useBalance, useConnect, useDisconnect, useSwitchChain,
} from "wagmi";
import { monadTestnet } from "@/lib/chain";

/**
 * The operator's wallet, as the rest of the app sees it.
 *
 * Everything here is real: the address comes from an injected wallet, the
 * balance from the Monad RPC. There is no local shadow of either — if the
 * chain says the balance is zero, the UI says zero.
 */
export function useSession() {
  const { address, isConnected, chainId, status } = useAccount();
  const { connectors, connect, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const { data: bal, refetch: refetchBalance } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  });

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  const doConnect = useCallback(() => {
    if (injected) connect({ connector: injected });
  }, [connect, injected]);

  const wrongNetwork = isConnected && chainId !== monadTestnet.id;

  const balance = useMemo(() => (bal ? Number(bal.value) / 1e18 : 0), [bal]);

  return {
    address: address ?? null,
    balance,
    balanceWei: bal?.value ?? 0n,
    connected: isConnected,
    connecting: connecting || status === "connecting" || status === "reconnecting",
    hasWallet: Boolean(injected),
    connectError,
    wrongNetwork,
    switching,
    connect: doConnect,
    disconnect,
    switchToMonad: () => switchChain({ chainId: monadTestnet.id }),
    refetchBalance,
  };
}
