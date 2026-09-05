"use client";

import { useCallback, useMemo } from "react";
import {
  useAccount, useBalance, useConnect, useDisconnect, useSwitchChain,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { monadTestnet } from "@/lib/chain";

/**
 * The operator's wallet, as the rest of the app sees it.
 *
 * Everything here is real: the address comes from the wallet the operator
 * picks in the RainbowKit modal, the balance from the Monad RPC. There is no
 * local shadow of either — if the chain says the balance is zero, the UI says
 * zero.
 */
export function useSession() {
  const { address, isConnected, chainId, status } = useAccount();
  const { isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();

  const { data: bal, refetch: refetchBalance } = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  });

  // The wallet choice belongs to the modal, so this only has to open it.
  const doConnect = useCallback(() => {
    openConnectModal?.();
  }, [openConnectModal]);

  const wrongNetwork = isConnected && chainId !== monadTestnet.id;

  const balance = useMemo(() => (bal ? Number(bal.value) / 1e18 : 0), [bal]);

  return {
    address: address ?? null,
    balance,
    balanceWei: bal?.value ?? 0n,
    connected: isConnected,
    connecting: connecting || connectModalOpen || status === "connecting" || status === "reconnecting",
    connectError,
    wrongNetwork,
    switching,
    connect: doConnect,
    disconnect,
    switchToMonad: () => switchChain({ chainId: monadTestnet.id }),
    refetchBalance,
  };
}
