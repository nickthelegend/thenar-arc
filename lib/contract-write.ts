"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { LOCALNET, appChain } from "./chain";
import { localSponsored } from "./local-sponsor";
import { prepareGas } from "./monad-gas";

/**
 * Whether Privy pays the gas for operators' writes.
 *
 * Off unless NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP=1, which is set only once gas
 * sponsorship for Monad Testnet is enabled in the Privy dashboard: without it,
 * Privy refuses a sponsored send. Fixed at build time, like the session, so a
 * local-chain build never calls a Privy hook.
 */
export const GAS_SPONSORED = !LOCALNET && process.env.NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP === "1";

export type ContractWrite = {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * The limit a write is sent with: the node's estimate plus a tenth, after a
 * simulation that must not revert, and the reserve rule on a MON spend
 * (lib/monad-gas.ts). Monad charges the whole limit, so it is never left to a
 * wallet's own padding. The reserve rule is Monad's; a local chain does not
 * enforce it.
 */
function usePrepareGas() {
  const client = usePublicClient();
  const { address } = useAccount();
  return useCallback(
    async (req: ContractWrite) => (client && address ? prepareGas(client, address, req, { reserve: !LOCALNET }) : undefined),
    [client, address],
  );
}

/** The wallet pays its own gas: wagmi, as every write always did. */
function useWalletWrite() {
  const { writeContractAsync: write } = useWriteContract();
  const prepare = usePrepareGas();
  const writeContractAsync = useCallback(
    async (req: ContractWrite) => {
      const gas = await prepare(req);
      return write({ ...req, ...(gas ? { gas } : {}) } as Parameters<typeof write>[0]);
    },
    [write, prepare],
  );
  return { writeContractAsync };
}

/**
 * Privy pays the gas when the operator signed in with email.
 *
 * Only the embedded wallet Privy made can be sponsored. An operator who brought
 * their own wallet still pays for themselves, through wagmi, exactly as before.
 * The transaction is the same call either way, so the contract cannot tell.
 */
function useSponsoredWrite() {
  const { writeContractAsync: write } = useWriteContract();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const embedded = wallets.find(
    (w) => w.walletClientType === "privy" && w.address.toLowerCase() === address?.toLowerCase(),
  );
  const prepare = usePrepareGas();

  const writeContractAsync = useCallback(
    async (req: ContractWrite): Promise<`0x${string}`> => {
      const gas = await prepare(req);
      if (!embedded) return write({ ...req, ...(gas ? { gas } : {}) } as Parameters<typeof write>[0]);
      const data = encodeFunctionData({ abi: req.abi as Abi, functionName: req.functionName, args: req.args });
      const { hash } = await sendTransaction(
        {
          to: req.address, data, chainId: appChain.id,
          ...(req.value !== undefined ? { value: req.value } : {}),
          ...(gas ? { gasLimit: gas } : {}),
        },
        { sponsor: true, address: embedded.address },
      );
      return hash;
    },
    [embedded, write, sendTransaction, prepare],
  );
  return { writeContractAsync };
}

/** Chosen once, at build time, so every render calls the same hooks. */
export const useContractWrite = GAS_SPONSORED ? useSponsoredWrite : useWalletWrite;

/** Whether this session's writes are paid for by Privy: email sign-in, sponsorship on. */
function useSponsoredGas() {
  const { wallets } = useWallets();
  const { address } = useAccount();
  return wallets.some((w) => w.walletClientType === "privy" && w.address.toLowerCase() === address?.toLowerCase());
}
/** On the local chain, the local wallet's sponsored mode (lib/local-sponsor.ts), read after mount. */
function useLocalSponsoredGas() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(localSponsored()), 0);
    return () => clearTimeout(t);
  }, []);
  return on;
}
export const useGasSponsored: () => boolean = GAS_SPONSORED ? useSponsoredGas : LOCALNET ? useLocalSponsoredGas : () => false;
