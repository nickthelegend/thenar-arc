"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useContractWrite } from "./contract-write";
import {
  BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeEventLog, encodeFunctionData,
  toFunctionSelector, type Hex, type TransactionReceipt,
} from "viem";
import { formatAbiItem } from "viem/utils";
import { PASSKEY_ABI } from "./passkey-abi";
import {
  CONTRIBUTION_RECORD_ABI, CORPUS_AUDIT_ABI, CORPUS_SHARES_ABI, SALES_LOG_ABI, THENAR_CCIP_RECEIVER_ABI,
  THENAR_VERDICTS_ABI, TRAJECTORY_CERTIFICATE_ABI,
} from "./registry-abi";
import { AXON_ABI } from "./abi";
import { ARC_EXTERNAL, AXON_ADDRESS, LOCALNET, USDC } from "./chain";
import { MEMO_ABI, probeMemo, runMemoLine, wrapInMemo } from "./memo";
import { trackReceipt, type Timers } from "./receipt-timers";
import { formatNative, formatUsdc } from "./usdc";
import type { Sample } from "./types";
import { CURRENCY, FAUCET_URL } from "@/lib/chain";

export type SubmitPhase =
  | "idle" | "verifying" | "signing" | "pending" | "confirmed" | "error";

/** The run's corpus shares, as /api/submitted reported them. */
export type RunShares =
  | { issued: true; tx: string; units?: string; already?: boolean }
  | { issued: false; reason: string };

/**
 * Whether the run's payout carries an Arc Memo tag (lib/memo.ts): the submit
 * went through `Memo.memo(protocol, submitTrajectory…, memoId = trajHash, line)`,
 * so the chain records, indexed by the run id, what the USDC was for.
 */
export type RunMemo =
  | { tagged: true; memoId: Hex; line: string; memoIndex?: bigint }
  | { tagged: false; reason: string };

export type SubmitState = {
  phase: SubmitPhase;
  txHash?: `0x${string}`;
  trajHash?: `0x${string}`;
  cid?: string;
  score?: number;
  /** What the protocol paid, in USDC base units (6 dec), read from the receipt's TrajectoryAccepted. */
  paid?: bigint;
  paidUsdc?: number;
  /** The payout's transfer failed and it waits in `claimable` instead (PaymentDeferred). */
  deferred?: boolean;
  /** Send to final, measured here (lib/receipt-timers.ts). */
  timers?: Timers;
  /** What the submit cost in gas, in USDC (gas used times price, 18-dec native). */
  gasUsdc?: number;
  gasLimit?: bigint;
  gasUsed?: bigint;
  memo?: RunMemo;
  error?: string;
  /** The verifier refused because no passkey has admitted this address yet. */
  passkeyRequired?: boolean;
  /** True between the payout confirming and the share issuance being reported. */
  sharesPending?: boolean;
  shares?: RunShares;
};

/**
 * Whether this node executes Arc's CallFrom (Memo), asked once per page
 * session. Arc testnet and mainnet do; a local fork's node does not, and
 * there runs are sent as plain calls and say "untagged".
 */
let memoLive: Promise<boolean> | null = null;
function memoIsLive(client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<boolean> {
  memoLive ??= probeMemo(client as never, USDC, ARC_EXTERNAL.memo).catch(() => false);
  return memoLive;
}

/** What the receipt says the run paid, and whether that payment was deferred to `claimable`. */
function payoutOf(receipt: TransactionReceipt, trajHash: Hex): { paid?: bigint; deferred: boolean } {
  let paid: bigint | undefined;
  let deferred = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== AXON_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: AXON_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "TrajectoryAccepted" && (ev.args as { trajHash: Hex }).trajHash.toLowerCase() === trajHash.toLowerCase()) {
        paid = (ev.args as { paid: bigint }).paid;
      }
      if (ev.eventName === "PaymentDeferred") deferred = true;
    } catch {
      /* not one of the protocol's events */
    }
  }
  return { paid, deferred };
}

/** The Memo event in a receipt for this run, if the submit was tagged. */
export function memoOf(receipt: TransactionReceipt, memoId: Hex): { line: string; memoIndex: bigint } | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ARC_EXTERNAL.memo.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MEMO_ABI, data: log.data, topics: log.topics });
      if (ev.eventName !== "Memo") continue;
      const a = ev.args as { memoId: Hex; memo: Hex; memoIndex: bigint };
      if (a.memoId.toLowerCase() !== memoId.toLowerCase()) continue;
      const bytes = a.memo.slice(2).match(/../g) ?? [];
      return { line: new TextDecoder().decode(Uint8Array.from(bytes.map((b) => Number.parseInt(b, 16)))), memoIndex: a.memoIndex };
    } catch {
      /* not a Memo event */
    }
  }
  return null;
}

/**
 * Every custom error the deployed contracts declare, by selector.
 *
 * A write made with a pruned ABI that leaves a contract's errors out reverts
 * as a bare selector, and the page showed it as such: "reverted with the
 * following signature: 0xddefae28". The selector is enough to name the error,
 * and the name is enough to say what happened. Built from the generated ABIs,
 * so it names exactly the errors the deployed contracts have, plus Circle's
 * USDC and CCTP reverts an operator can hit.
 */
const ERROR_BY_SELECTOR = new Map<string, string>();
for (const abi of [AXON_ABI, PASSKEY_ABI, TRAJECTORY_CERTIFICATE_ABI, CONTRIBUTION_RECORD_ABI, CORPUS_SHARES_ABI, SALES_LOG_ABI, CORPUS_AUDIT_ABI, THENAR_VERDICTS_ABI, THENAR_CCIP_RECEIVER_ABI] as readonly (readonly unknown[])[]) {
  for (const item of abi as readonly { type: string; name?: string }[]) {
    if (item.type !== "error" || !item.name) continue;
    try {
      ERROR_BY_SELECTOR.set(toFunctionSelector(formatAbiItem(item as never)), item.name);
    } catch {
      /* an error the formatter cannot render is left unnamed */
    }
  }
}

/** Turn any wallet or contract failure into a sentence an operator can act on. */
export function explainTxError(e: unknown): string {
  if (e instanceof UserRejectedRequestError) return "You rejected the transaction in your wallet.";
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
        ?? (reverted.signature ? ERROR_BY_SELECTOR.get(reverted.signature) : undefined)
        ?? "";
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
        TooManyContributors: "This task has reached its contributor limit.",
        AlreadyMinted: "This run's certificate has already been minted.",
        NoSuchTrajectory: "The protocol has no run with that number.",
        Expired: "This task is past its deadline. It takes no more runs.",
        NotExpired: "This task's deadline has not passed yet, so it cannot be closed.",
        NotFunder: "Only the address that funded this task can close it.",
        AlreadyClosed: "This task is already closed.",
        NotFilled: "This task has not filled every slot yet, so its policy cannot be minted.",
        NoSuchPolicy: "There is no policy with that number.",
        NothingToSync: "There is no new work to sync.",
        AccountIsNotInControlList: "This address is not on the corpus shares whitelist. Set up your passkey first.",
        EscrowCapExceeded: "That escrow is above this deployment's per-task cap.",
        WrongNonce: "The funding authorisation was signed for different task terms. Sign it again.",
        NoSuchTask: "The protocol has no task with that number.",
        NothingToClaim: "There is no USDC waiting to be claimed for this address.",
        SafeERC20FailedOperation: "A USDC transfer failed: check the balance and the approval, then try again.",
        NoPasskey: "This address has no passkey registered yet. Set one up first.",
        BadPasskeySignature: "The passkey signature did not verify on chain.",
      };
      if (name && map[name]) return map[name];
      if (name) return `The contract rejected this: ${name}.`;
    }
    const text = `${e.shortMessage ?? ""} ${e.message ?? ""} ${e.details ?? ""}`;
    if (/exceeds allowance/i.test(text)) return "The USDC approval is short of the amount. Approve it again and retry.";
    if (/exceeds balance/i.test(text)) return "This wallet does not hold enough USDC for that.";
    if (/insufficient funds/i.test(text)) {
      return `Not enough ${CURRENCY} to cover gas (gas on Arc is USDC). Top up from ${FAUCET_URL.startsWith("/") ? "the fork's faucet" : new URL(FAUCET_URL).host} and try again.`;
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
  const { writeContractAsync, sendRawAsync } = useContractWrite();
  const [state, setState] = useState<SubmitState>({ phase: "idle" });

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const submit = useCallback(
    async (args: {
      taskId: number;
      samples: Sample[];
      durationSeconds: number;
      deviationMm: number;
      success: boolean;
      /** The props the run was driven against, when the instruction did not
       *  determine them. Sent so the verifier hashes the same scene the
       *  operator actually drove, rather than one it guessed at. */
      payloadIds?: string[];
    }) => {
      if (!address || !client) {
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
        if (!res.ok) {
          // No passkey behind this address yet: nothing is scored or signed,
          // and the station shows the passkey step instead.
          if (v.passkeyRequired) {
            setState({ phase: "error", error: v.error, passkeyRequired: true });
            return;
          }
          throw new Error(v.error ?? "The verifier rejected this run.");
        }
        if (!v.accepted) {
          setState({
            phase: "error",
            score: v.score,
            error: "The run scored below the acceptance floor. Nothing was charged — run it again.",
          });
          return;
        }

        // 2. One transaction records the trajectory and pays for it in USDC.
        //    Through Arc's Memo when the node runs CallFrom and the sender is a
        //    plain EOA (Memo calls the protocol *as* the sender, so it still
        //    pays the operator), tagged with the run id; a plain call otherwise.
        setState({ phase: "signing", trajHash: v.trajHash, cid: v.cid, score: v.score });
        const trajHash = v.trajHash as Hex;
        const line = runMemoLine(args.taskId, v.score);
        const submitArgs = [BigInt(args.taskId), trajHash, v.cid, v.score, v.signature] as const;
        const [live, code] = await Promise.all([
          memoIsLive(client),
          client.getCode({ address }).catch(() => undefined),
        ]);
        const eoa = !code || code === "0x";
        const viaMemo = live && eoa;

        const txHash = viaMemo
          ? await sendRawAsync(wrapInMemo({
              memo: ARC_EXTERNAL.memo,
              target: AXON_ADDRESS,
              data: encodeFunctionData({ abi: AXON_ABI, functionName: "submitTrajectory", args: submitArgs }),
              memoId: trajHash,
              line,
            }))
          : await writeContractAsync({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "submitTrajectory", args: submitArgs });

        // The clock starts when the wallet hands the transaction over, so the
        // signing prompt is not in it.
        const sentAt = performance.now();
        setState((s) => ({ ...s, phase: "pending", txHash }));

        // Arc is final on inclusion: the receipt is the settlement.
        const { receipt, timers } = await trackReceipt(client, txHash, {
          sentAt,
          where: LOCALNET ? "fork" : "arc",
          onUpdate: (t) => setState((s) => (s.txHash === txHash ? { ...s, timers: t } : s)),
        });

        if (receipt.status !== "success") {
          setState((s) => ({ ...s, phase: "error", error: "The transaction reverted on chain." }));
          return;
        }

        const sent = await client.getTransaction({ hash: txHash }).catch(() => null);
        const gasUsdc = Number(formatNative(receipt.gasUsed * receipt.effectiveGasPrice));
        const { paid, deferred } = payoutOf(receipt, trajHash);
        const tag = viaMemo ? memoOf(receipt, trajHash) : null;
        const memo: RunMemo = tag
          ? { tagged: true, memoId: trajHash, line: tag.line, memoIndex: tag.memoIndex }
          : {
              tagged: false,
              reason: viaMemo
                ? "sent through Memo, but no Memo event came back"
                : !live
                  ? LOCALNET ? "this fork's node does not run Arc's CallFrom, so the run went as a plain call" : "Memo's CallFrom did not answer the probe, so the run went as a plain call"
                  : "this wallet is not a plain EOA, which Memo requires",
            };

        setState((s) => ({
          phase: "confirmed",
          timers: s.timers ?? timers,
          txHash,
          trajHash,
          cid: v.cid,
          score: v.score,
          paid,
          paidUsdc: paid !== undefined ? Number(formatUsdc(paid)) : undefined,
          deferred,
          gasUsdc,
          gasLimit: sent?.gas,
          gasUsed: receipt.gasUsed,
          memo,
          sharesPending: true,
        }));

        // 3. Record the tx against the stored trajectory, which is also what
        //    issues the run's share of the corpus in CorpusShares. The payout above is
        //    already final either way, so a failure here is reported, not thrown.
        try {
          const recorded = await fetch("/api/submitted", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ trajHash, txHash, memo: memo.tagged }),
          });
          const body = await recorded.json();
          const shares: RunShares = recorded.ok && body.shares
            ? body.shares
            : { issued: false, reason: body.error ?? "the run could not be recorded" };
          setState((s) => ({ ...s, sharesPending: false, shares }));
        } catch (e) {
          setState((s) => ({
            ...s,
            sharesPending: false,
            shares: { issued: false, reason: e instanceof Error ? e.message : "the run could not be recorded" },
          }));
        }
      } catch (e) {
        setState({ phase: "error", error: explainTxError(e) });
      }
    },
    [address, client, writeContractAsync, sendRawAsync],
  );

  return { ...state, submit, reset };
}
