"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useContractWrite } from "./contract-write";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS } from "./chain";
import { explainTxError } from "./submit";

export type TxPhase = "idle" | "signing" | "pending" | "confirmed" | "error";

type Target = { address: `0x${string}`; abi: readonly unknown[] };

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
   * The exceptions are real ones: minting a run's certificate, syncing a
   * contribution record, setting a dividend are calls to their own contracts.
   * Passing the address and ABI is what lets one error path and one phase
   * machine cover them too.
   *
   * There is no `value`: on Arc every amount is the USDC ERC-20, pulled by the
   * contract after an approval (lib/usdc-approve.ts). The third argument still
   * accepts the old `undefined` placeholder so `run(fn, args, undefined, on)`
   * keeps working; a non-zero native amount is refused rather than sent.
   */
  const run = useCallback(
    async (
      functionName: string,
      args: readonly unknown[],
      onOrLegacy?: Target | bigint,
      legacyOn?: Target,
    ) => {
      if (typeof onOrLegacy === "bigint" && onOrLegacy > 0n) {
        setPhase("error");
        setError("Arc writes carry no native value: approve USDC and let the contract pull it.");
        return null;
      }
      const on = typeof onOrLegacy === "object" ? onOrLegacy : legacyOn;
      try {
        setError(undefined);
        setPhase("signing");
        const started = performance.now();

        const hash = await writeContractAsync({
          address: on?.address ?? AXON_ADDRESS,
          abi: on?.abi ?? AXON_ABI,
          functionName,
          args,
        });

        setTxHash(hash);
        setPhase("pending");

        // Arc is final on inclusion: the receipt is the settlement, not a first confirmation.
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
