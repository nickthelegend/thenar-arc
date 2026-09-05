"use client";

import { useCallback, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS } from "./chain";
import { explainTxError } from "./submit";

export type TxPhase = "idle" | "signing" | "pending" | "confirmed" | "error";

/** One shared write path so every transaction reports the same way. */
export function useAxonWrite() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [elapsedMs, setElapsedMs] = useState<number | undefined>();

  const reset = useCallback(() => {
    setPhase("idle");
    setTxHash(undefined);
    setError(undefined);
    setElapsedMs(undefined);
  }, []);

  const run = useCallback(
    async (functionName: string, args: readonly unknown[], value?: bigint) => {
      try {
        setError(undefined);
        setPhase("signing");
        const started = performance.now();

        const hash = await writeContractAsync({
          address: AXON_ADDRESS,
          abi: AXON_ABI,
          functionName,
          args,
          ...(value !== undefined ? { value } : {}),
        } as Parameters<typeof writeContractAsync>[0]);

        setTxHash(hash);
        setPhase("pending");

        const receipt = await client!.waitForTransactionReceipt({ hash });
        setElapsedMs(performance.now() - started);

        if (receipt.status !== "success") {
          setPhase("error");
          setError("The transaction reverted on chain.");
          return null;
        }
        setPhase("confirmed");
        return receipt;
      } catch (e) {
        setPhase("error");
        setError(explainTxError(e));
        return null;
      }
    },
    [client, writeContractAsync],
  );

  return { phase, txHash, error, elapsedMs, run, reset, busy: phase === "signing" || phase === "pending" };
}
