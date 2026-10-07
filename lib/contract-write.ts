"use client";

import { useCallback } from "react";
import type { Abi } from "viem";
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import { prepareGas, prepareRawGas } from "./arc-gas";

/**
 * Every browser write, one way.
 *
 * The wallet pays its own gas, in USDC: on Arc the gas token is the same
 * dollar an operator is paid in, so there is no second token to hold and
 * nothing to sponsor. An operator who signed in with email writes through the
 * embedded wallet Privy made on Arc; one who brought a wallet writes through
 * that; a fork build writes through the in-browser local wallet. wagmi hides
 * which, so every surface calls the same hook.
 *
 * Writes carry no `value`: Thenar moves USDC as the ERC-20 (6 decimals), and a
 * write that pulls it is preceded by an approval (lib/usdc-approve.ts).
 */
export type ContractWrite = {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

/** A prepared call sent as it is: a Memo-wrapped submit (lib/memo.ts) is one. */
export type RawWrite = { to: `0x${string}`; data: `0x${string}` };

export function useContractWrite() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync: write } = useWriteContract();
  const { sendTransactionAsync: send } = useSendTransaction();

  /** Estimated first (a revert stops it here, with the reason), then sent with the estimate plus a fifth. */
  const writeContractAsync = useCallback(
    async (req: ContractWrite) => {
      const gas = client && address ? await prepareGas(client, address, req) : undefined;
      return write({ ...req, ...(gas ? { gas } : {}) } as Parameters<typeof write>[0]);
    },
    [client, address, write],
  );

  const sendRawAsync = useCallback(
    async (req: RawWrite) => {
      const gas = client && address ? await prepareRawGas(client, address, req.to, req.data) : undefined;
      return send({ to: req.to, data: req.data, ...(gas ? { gas } : {}) });
    },
    [client, address, send],
  );

  return { writeContractAsync, sendRawAsync };
}

/**
 * Whether someone else pays this session's gas. Never, on Arc: gas is USDC and
 * the operator holds USDC. Kept as a hook so surfaces that branch on it
 * (components/conditions.tsx) read one answer.
 */
export const useGasSponsored = (): boolean => false;
