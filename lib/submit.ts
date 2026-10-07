"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useContractWrite } from "./contract-write";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, toFunctionSelector } from "viem";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS, LOCALNET } from "./chain";
import { trackReceipt, type Timers } from "./receipt-timers";
import type { Sample } from "./types";
import { CURRENCY, FAUCET_URL } from "@/lib/chain";

export type SubmitPhase =
  | "idle" | "verifying" | "signing" | "pending" | "confirmed" | "error";

/** The run's corpus shares, as /api/submitted reported them. */
export type RunShares =
  | { issued: true; tx: string; units?: string; already?: boolean }
  | { issued: false; reason: string };

export type SubmitState = {
  phase: SubmitPhase;
  txHash?: `0x${string}`;
  trajHash?: `0x${string}`;
  cid?: string;
  score?: number;
  paidMon?: number;
  /** Executed and final, measured from the send (lib/receipt-timers.ts). */
  timers?: Timers;
  gasMon?: number;
  /** The transaction's gas limit and the gas it used: Monad charges the first. */
  gasLimit?: bigint;
  gasUsed?: bigint;
  error?: string;
  /** The verifier refused because no passkey has admitted this address yet. */
  passkeyRequired?: boolean;
  /** True between the payout confirming and the share issuance being reported. */
  sharesPending?: boolean;
  shares?: RunShares;
};

/** Turn any wallet or contract failure into a sentence an operator can act on. */
/**
 * Every custom error the deployed contracts declare, by selector.
 *
 * A write made with a pruned ABI that leaves a contract's errors out reverts
 * as a bare selector, and the page showed it as such: "The contract function
 * "mint" reverted with the following signature: 0xddefae28". The selector is
 * enough to name the error, and the name is enough to say what happened.
 */
const ERROR_SIGNATURES = [
  "AccountIsNotInControlList(address)",
  "AlreadyClaimed()",
  "AlreadyClaimed(uint256,address)",
  "AlreadyClosed()",
  "AlreadyEntered()",
  "AlreadyExecuted()",
  "AlreadyLogged(bytes32)",
  "AlreadyMinted()",
  "AlreadySettled()",
  "AlreadySubmitted()",
  "AlreadyUsed()",
  "AlreadyVoted()",
  "BadDuration()",
  "BadPasskeySignature()",
  "BadSignature()",
  "CannotReferYourself()",
  "CapReached()",
  "DividendNotPayable(uint256,uint64)",
  "EmptyCorpus()",
  "EntryClosed()",
  "EscrowEmpty()",
  "ExecutionBeforeRecord(uint64,uint64)",
  "Expired()",
  "InsufficientAllowance(uint256,uint256)",
  "InsufficientBalance(uint256,uint256)",
  "KeyAlreadySet()",
  "NoCommitment()",
  "NoKey()",
  "NoPasskey()",
  "NoPolicy()",
  "NoRecordedWork()",
  "NoSlots()",
  "NoStanding()",
  "NoSuchDividend(uint256)",
  "NoSuchPolicy()",
  "NoSuchProposal()",
  "NoSuchSale(uint256)",
  "NoSuchTrajectory()",
  "NoToken()",
  "NotClosedYet()",
  "NotEnoughWork()",
  "NotExpired()",
  "NotFilled()",
  "NotFunder()",
  "NotIssuer()",
  "NotMessenger()",
  "NotOnCurve()",
  "NotSeller()",
  "NotTheAdder()",
  "NotTheContributor()",
  "NotTransferable()",
  "NotVerifier()",
  "NothingOwed(uint256,address)",
  "NothingToClaim()",
  "NothingToReclaim(uint256)",
  "NothingToSplit()",
  "NothingToSync()",
  "PaymentFailed(address,uint256)",
  "PotEmpty()",
  "PrecompileUnavailable()",
  "RecordDateNotInFuture(uint64)",
  "ReferrerAtCap()",
  "ReferrerHasNoWork()",
  "Rejected()",
  "ScoreTooHigh()",
  "ScoreTooLow()",
  "ShardFull()",
  "Soulbound()",
  "StillOpen()",
  "TaskClosed()",
  "TooManyContributors()",
  "TransferFailed()",
  "TreasuryTooSmall()",
  "Unchanged()",
  "Underfunded()",
  "Underpaid()",
  "VotingClosed()",
  "WrongAnnouncer(address)",
  "WrongFee()",
  "WrongSourceChain(bytes32)",
  "ZeroAmount()",
  "ZeroReward()",
  "ZeroSlots()",
];
const ERROR_BY_SELECTOR = new Map(ERROR_SIGNATURES.map((s) => [toFunctionSelector(s), s.slice(0, s.indexOf("("))]));

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
        WrongFee: "The licence fee sent did not match the price.",
        TooManyContributors: "This task has reached its contributor limit.",
        AlreadyMinted: "This run's certificate has already been minted.",
        NoSuchTrajectory: "The protocol has no run with that number.",
        Expired: "This task is past its deadline. It takes no more runs.",
        NotExpired: "This task's deadline has not passed yet, so it cannot be closed.",
        NotFunder: "Only the address that funded this task can close it.",
        AlreadyClosed: "This task is already closed.",
        NotFilled: "This task has not filled every slot yet, so its policy cannot be minted.",
        NoSuchPolicy: "There is no policy with that number.",
        AlreadyVoted: "You have already voted on this proposal.",
        VotingClosed: "Voting on this proposal has closed.",
        NotEnoughWork: "Voting needs recorded, paid work on this protocol.",
        NoStanding: "Voting needs recorded, paid work on this protocol.",
        AlreadyExecuted: "This proposal has already been executed.",
        StillOpen: "Voting on this proposal is still open.",
        BadDuration: "Choose between 1 and 365 days.",
        Underpaid: "The payment sent was less than the price.",
        CannotReferYourself: "You cannot credit yourself as your own referrer.",
        AlreadyUsed: "That has already been used.",
        NothingToSync: "There is no new work to sync.",
        AccountIsNotInControlList: "This address is not on the corpus shares whitelist. Set up your passkey first.",
      };
      if (name && map[name]) return map[name];
      if (name) return `The contract rejected this: ${name}.`;
    }
    const text = `${e.shortMessage ?? ""} ${e.message ?? ""} ${e.details ?? ""}`;
    // The chain reserves against the gas limit rather than gas used, and the floor
    // it enforces sits well above value + gas. The wallet's own wording for
    // this ("Signer had insufficient balance") tells an operator nothing.
    if (/signer had insufficient balance/i.test(text)) {
      return (
        "The chain holds back more than the transaction costs — it reserves against " +
        "your whole gas limit, not what the transaction actually uses. Top up " +
        `from ${new URL(FAUCET_URL).host} and try again.`
      );
    }
    if (/insufficient funds/i.test(text)) {
      return `Not enough ${CURRENCY} to cover gas. Top up from the faucet and try again.`;
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
  const { writeContractAsync } = useContractWrite();
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
      /**
       * Authorise the run with a registered passkey instead of a wallet
       * signature. The wallet still sends the transaction and pays the gas;
       * what changes is that the operator's consent to *this run* is bound to
       * the trajectory rather than implied by the transaction.
       */
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

        // 2. One transaction records the trajectory and pays for it.
        setState({ phase: "signing", trajHash: v.trajHash, cid: v.cid, score: v.score });

        const txHash = await writeContractAsync({
          address: AXON_ADDRESS,
          abi: AXON_ABI,
          functionName: "submitTrajectory",
          args: [BigInt(args.taskId), v.trajHash, v.cid, v.score, v.signature],
        });

        // The clocks start when the wallet hands the transaction over, so the
        // signing prompt is in neither of them.
        const sentAt = performance.now();
        setState((s) => ({ ...s, phase: "pending", txHash }));

        const tracked = await trackReceipt(client!, txHash, {
          sentAt,
          where: LOCALNET ? "local" : "monad",
          // Only onto this transaction's state: finality can land after the operator has moved on.
          onUpdate: (timers) => setState((s) => (s.txHash === txHash ? { ...s, timers } : s)),
        });
        // On Monad a payout is credited once it is final, about 600 ms after it
        // executes. A local chain's finalized tag trails by a minute of blocks,
        // so there the card shows finality when it lands instead of holding the run.
        const { receipt } = LOCALNET ? tracked : await tracked.final;

        if (receipt.status !== "success") {
          setState((s) => ({ ...s, phase: "error", error: "The transaction reverted on chain." }));
          return;
        }

        // What the operator was charged: on Monad the whole gas limit, on a local
        // chain (Ethereum's rules) the gas used.
        const sent = await client!.getTransaction({ hash: txHash }).catch(() => null);
        const gasLimit = sent?.gas;
        const charged = LOCALNET || gasLimit === undefined ? receipt.gasUsed : gasLimit;
        const gasMon = Number(charged * receipt.effectiveGasPrice) / 1e18;
        const paidMon = (Number(v.rewardWei) * v.score) / 10_000 / 1e18;

        setState((s) => ({
          phase: "confirmed",
          timers: s.timers,
          txHash,
          trajHash: v.trajHash,
          cid: v.cid,
          score: v.score,
          paidMon,
          gasMon,
          gasLimit,
          gasUsed: receipt.gasUsed,
          sharesPending: true,
        }));

        // 3. Record the tx against the stored trajectory, which is also what
        //    issues the run's share of the corpus in CorpusShares. The payout above is
        //    already final either way, so a failure here is reported, not thrown.
        try {
          const recorded = await fetch("/api/submitted", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ trajHash: v.trajHash, txHash }),
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
    [address, client, writeContractAsync],
  );

  return { ...state, submit, reset };
}
