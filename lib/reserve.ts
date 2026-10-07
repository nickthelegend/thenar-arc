/**
 * Monad's reserve balance, as a check a page can make before it sends.
 *
 * Consensus on Monad runs a few blocks ahead of execution, so it cannot see
 * an account's exact balance when it includes a transaction. To make sure
 * every included transaction can still pay for its gas, each account keeps a
 * reserve of 10 MON that a transaction's value cannot dig into:
 * - a transaction that moves no MON (only pays gas) is never affected;
 * - one that leaves at least 10 MON behind is fine;
 * - an ordinary account that has sent nothing in the last three blocks may
 *   go below 10 MON once (the "emptying transaction");
 * - an EIP-7702-delegated account never gets that exception: any value spend
 *   that ends below 10 MON reverts, and still pays its gas.
 * Contracts can ask the precompile at 0x1001 (`dippedIntoReserve()`) after the
 * fact. A page can only reason ahead, which is this.
 *
 * Source: docs.monad.xyz/developer-essentials/reserve-balance.
 */

export const RESERVE_WEI = 10n * 10n ** 18n;
export const RESERVE_PRECOMPILE = "0x0000000000000000000000000000000000001001" as const;
/** `dippedIntoReserve()`; it must be reached with CALL, which an eth_call is. */
export const DIPPED_INTO_RESERVE = "0x3a61584e" as const;

/** EIP-7702 delegated code is 0xef0100 followed by the delegate's address. */
export const isDelegated = (code: string | undefined | null) => (code ?? "").toLowerCase().startsWith("0xef0100");

export type ReserveVerdict =
  | { ok: true; kind: "no-value" | "above-reserve"; leftWei: bigint }
  | { ok: true; kind: "emptying"; leftWei: bigint; note: string }
  | { ok: false; kind: "delegated-below-reserve"; leftWei: bigint; note: string };

export function reserveCheck(a: {
  balanceWei: bigint;
  valueWei: bigint;
  /** The most the transaction can cost in gas: its limit times its max fee. */
  maxGasCostWei: bigint;
  delegated: boolean;
}): ReserveVerdict {
  const leftWei = a.balanceWei - a.valueWei - a.maxGasCostWei;
  if (a.valueWei === 0n) return { ok: true, kind: "no-value", leftWei };
  if (leftWei >= RESERVE_WEI) return { ok: true, kind: "above-reserve", leftWei };
  if (a.delegated) {
    return {
      ok: false, kind: "delegated-below-reserve", leftWei,
      note: "This account is delegated (EIP-7702), and on Monad a delegated account cannot send MON that leaves it below its 10 MON reserve: the transaction would revert and still charge gas.",
    };
  }
  return {
    ok: true, kind: "emptying", leftWei,
    note: "This leaves the account below Monad's 10 MON reserve. That is allowed once, as long as it has sent nothing in the last three blocks (about a second).",
  };
}
