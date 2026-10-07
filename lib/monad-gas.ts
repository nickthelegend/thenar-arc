import { isDelegated, reserveCheck } from "./reserve";
import type { Abi, Address, PublicClient } from "viem";

/**
 * The gas limit every browser write sends, and the checks made before it does.
 *
 * Monad charges a transaction its whole gas limit, not the gas it uses, so a
 * padded limit is money spent. Worse, when a wallet's own estimate fails it
 * may fall back to a large default limit, and on Monad the user pays all of
 * it. So a write here:
 * 1. asks the node to estimate it. The node runs Monad's own gas rules, and
 *    an estimate that reverts means the write is not sent at all; the revert
 *    reason is shown instead;
 * 2. sends that estimate plus a tenth as an explicit limit, so no wallet
 *    applies its own margin on top;
 * 3. if it moves MON, checks the reserve-balance rule first (lib/reserve.ts),
 *    and refuses a send that Monad would revert.
 */

/** The estimate plus a tenth, rounded up. */
export const gasLimitFrom = (estimate: bigint) => (estimate * 11n + 9n) / 10n;

export async function prepareGas(
  client: PublicClient,
  from: Address,
  req: { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint },
  opts: { reserve: boolean },
): Promise<bigint> {
  const estimate = await client.estimateContractGas({
    address: req.address, abi: req.abi as Abi, functionName: req.functionName, args: req.args as never,
    value: req.value, account: from,
  } as never);
  const gas = gasLimitFrom(estimate);
  if (opts.reserve && req.value && req.value > 0n) {
    const [balanceWei, code, fees] = await Promise.all([
      client.getBalance({ address: from }),
      client.getCode({ address: from }),
      client.estimateFeesPerGas().catch(() => null),
    ]);
    const maxFee = fees?.maxFeePerGas ?? fees?.gasPrice ?? 0n;
    const verdict = reserveCheck({ balanceWei, valueWei: req.value, maxGasCostWei: gas * maxFee, delegated: isDelegated(code) });
    if (!verdict.ok) throw new Error(verdict.note);
  }
  return gas;
}
