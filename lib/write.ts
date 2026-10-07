"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useContractWrite } from "./contract-write";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS } from "./chain";
import { explainTxError } from "./submit";

export type TxPhase = "idle" | "signing" | "pending" | "confirmed" | "error";

/** One shared write path so every transaction reports the same way. */
export function useThenarWrite() {
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useContractWrite();
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

  /**
   * Send a write and report it the one way every surface reports one.
   *
   * Defaults to the protocol, because that is where almost every write goes.
   * The exceptions are real ones and were unreachable for exactly this reason:
   * minting a run's certificate and buying corpus access are calls to their own
   * contracts, both open to anyone, both deployed and read by this interface
   * and callable from none of it. Passing the address and ABI is what lets one
   * error path and one phase machine cover them too.
   */
  const run = useCallback(
    async (
      functionName: string,
      args: readonly unknown[],
      value?: bigint,
      on?: { address: `0x${string}`; abi: readonly unknown[] },
    ) => {
      try {
        setError(undefined);
        setPhase("signing");
        const started = performance.now();

        const hash = await writeContractAsync({
          address: on?.address ?? AXON_ADDRESS,
          abi: on?.abi ?? AXON_ABI,
          functionName,
          args,
          ...(value !== undefined ? { value } : {}),
        });

        setTxHash(hash);
        setPhase("pending");

        const receipt = await client!.waitForTransactionReceipt({ hash });
        setElapsedMs(performance.now() - started);

        if (receipt.status !== "success") {
          setPhase("error");
          setError("The transaction reverted on chain.");
          void queryClient.invalidateQueries();
          return null;
        }
        setPhase("confirmed");
        // Everything on the page reads the chain through the query cache, and
        // nothing told it the chain had just changed: a minted certificate
        // kept offering its mint, a closed task its close. Every read is
        // marked stale, and the ones on screen re-read now.
        void queryClient.invalidateQueries();
        return receipt;
      } catch (e) {
        setPhase("error");
        setError(explainTxError(e));
        // A revert usually means the page's picture is out of date (somebody
        // else minted, filled or closed it first), so it re-reads too.
        void queryClient.invalidateQueries();
        return null;
      }
    },
    [client, writeContractAsync, queryClient],
  );

  return { phase, txHash, error, elapsedMs, run, reset, busy: phase === "signing" || phase === "pending" };
}
