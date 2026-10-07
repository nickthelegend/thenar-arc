"use client";

import { useCallback } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { USDC } from "./chain";
import { useContractWrite } from "./contract-write";
import { USDC_ABI } from "./usdc";

/**
 * Before a write that pulls USDC (createTask, fundTask, licensePolicy,
 * setDividend, a CCTP burn), make sure the spender may take `amount`.
 *
 * Reads the allowance first and sends an exact `approve` only when it is
 * short, then waits for it: Arc is final on inclusion, so the pull that
 * follows can be sent the moment the approval's receipt is back. Returns the
 * approval's hash, or null when none was needed.
 */
export function useEnsureUsdcAllowance() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useContractWrite();
  return useCallback(
    async (spender: Address, amount: bigint): Promise<`0x${string}` | null> => {
      if (!client || !address) throw new Error("Connect a wallet first.");
      const have = (await client.readContract({
        address: USDC, abi: USDC_ABI, functionName: "allowance", args: [address, spender],
      })) as bigint;
      if (have >= amount) return null;
      const hash = await writeContractAsync({ address: USDC, abi: USDC_ABI, functionName: "approve", args: [spender, amount] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The USDC approval reverted.");
      return hash;
    },
    [client, address, writeContractAsync],
  );
}

/** The wallet's USDC as the ERC-20 reports it (6 decimals). */
export function useReadUsdcBalance() {
  const client = usePublicClient();
  return useCallback(
    async (who: Address) => (await client!.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [who] })) as bigint,
    [client],
  );
}
