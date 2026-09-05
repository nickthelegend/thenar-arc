"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS } from "./chain";
import type { Sample } from "./types";

export type SubmitPhase =
  | "idle" | "verifying" | "signing" | "pending" | "confirmed" | "error";

export type SubmitState = {
  phase: SubmitPhase;
  txHash?: `0x${string}`;
  trajHash?: `0x${string}`;
  cid?: string;
  score?: number;
  paidMon?: number;
  blockMs?: number;
  gasMon?: number;
  error?: string;
};

/** Turn any wallet or contract failure into a sentence an operator can act on. */
export function explainTxError(e: unknown): string {
  if (e instanceof UserRejectedRequestError) return "You rejected the transaction in your wallet.";
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "";
      const map: Record<string, string> = {
        NoSlots: "This task filled its last slot while you were running. Pick another.",
        CapReached: "You have already submitted the maximum of 5 runs for this task.",
        ScoreTooLow: "The run scored below the acceptance floor, so it cannot be submitted.",
        ScoreTooHigh: "The score is out of range. Re-run the task.",
        AlreadySubmitted: "This exact trajectory has already been recorded on chain.",
        EscrowEmpty: "This task has run out of escrow. The funder needs to top it up.",
        BadSignature: "The verifier signature did not match. Re-run the task to get a fresh one.",
        TaskClosed: "This task is closed — its policy has already been minted.",
        Underfunded: "The escrow does not cover a single run at that rate.",
        ZeroSlots: "A task needs at least one slot.",
        ZeroReward: "A task needs a reward above zero.",
        WrongFee: "The licence fee sent did not match the price.",
        TooManyContributors: "This task has reached its contributor limit.",
      };
      if (name && map[name]) return map[name];
      if (name) return `The contract rejected this: ${name}.`;
    }
    if (/insufficient funds/i.test(e.shortMessage ?? e.message)) {
      return "Not enough MON to cover gas. Top up from the faucet and try again.";
    }
    if (/user rejected/i.test(e.shortMessage ?? e.message)) {
      return "You rejected the transaction in your wallet.";
    }
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong submitting the run.";
}

export function useSubmitRun() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<SubmitState>({ phase: "idle" });

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const submit = useCallback(
    async (args: {
      taskId: number;
      samples: Sample[];
      durationSeconds: number;
      deviationMm: number;
      success: boolean;
    }) => {
      if (!address) {
        setState({ phase: "error", error: "Connect a wallet first." });
        return;
      }

      try {
        // 1. The server re-scores the run and signs it. The client's own score
        //    is never sent and never trusted.
        setState({ phase: "verifying" });
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...args, contributor: address }),
        });
        const v = await res.json();
        if (!res.ok) throw new Error(v.error ?? "The verifier rejected this run.");
        if (!v.accepted) {
          setState({
            phase: "error",
            score: v.score,
            error: "The run scored below the acceptance floor. Nothing was charged — run it again.",
          });
          return;
        }

        // 2. One transaction records the trajectory and pays for it.
        setState({ phase: "signing", trajHash: v.trajHash, cid: v.cid, score: v.score });
        const started = performance.now();
        const txHash = await writeContractAsync({
          address: AXON_ADDRESS,
          abi: AXON_ABI,
          functionName: "submitTrajectory",
          args: [BigInt(args.taskId), v.trajHash, v.cid, v.score, v.signature],
        });

        setState((s) => ({ ...s, phase: "pending", txHash }));

        const receipt = await client!.waitForTransactionReceipt({ hash: txHash });
        const blockMs = performance.now() - started;

        if (receipt.status !== "success") {
          setState((s) => ({ ...s, phase: "error", error: "The transaction reverted on chain." }));
          return;
        }

        const gasMon = Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18;
        const paidMon = (Number(v.rewardWei) * v.score) / 10_000 / 1e18;

        // 3. Record the tx against the stored trajectory so the run is auditable.
        fetch("/api/submitted", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trajHash: v.trajHash, txHash }),
        }).catch(() => {
          // The chain is the record of truth; a failed bookkeeping write is not
          // worth failing the operator's run over.
        });

        setState({
          phase: "confirmed",
          txHash,
          trajHash: v.trajHash,
          cid: v.cid,
          score: v.score,
          paidMon,
          blockMs,
          gasMon,
        });
      } catch (e) {
        setState({ phase: "error", error: explainTxError(e) });
      }
    },
    [address, client, writeContractAsync],
  );

  return { ...state, submit, reset };
}
