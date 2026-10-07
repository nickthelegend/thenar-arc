import type { Abi, Address, PublicClient } from "viem";

/**
 * The gas limit every browser write sends.
 *
 * Gas on Arc is paid in USDC, and Arc charges the gas a transaction uses, not
 * its limit, so headroom costs nothing. A write here still:
 * 1. asks the node to estimate it first. An estimate that reverts means the
 *    write is never sent, and the contract's own revert reason is shown
 *    instead of a wallet's generic failure;
 * 2. sends that estimate plus a fifth as an explicit limit, so a wallet's own
 *    padding (or a large fallback default when its estimate fails) never
 *    decides it, and a state change between estimate and inclusion (another
 *    run filling a slot's shard, a fresh storage slot) still fits.
 *
 * No write on Arc moves native value: every amount Thenar moves is the USDC
 * ERC-20, pulled by the contract after an approval.
 */

/** The estimate plus a fifth, rounded up. */
export const gasLimitFrom = (estimate: bigint) => (estimate * 12n + 9n) / 10n;

export async function prepareGas(
  client: PublicClient,
  from: Address,
  req: { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] },
): Promise<bigint> {
  const estimate = await client.estimateContractGas({
    address: req.address, abi: req.abi as Abi, functionName: req.functionName, args: req.args as never, account: from,
  } as never);
  return gasLimitFrom(estimate);
}

/** The same rule for a raw call (a Memo-wrapped submit is one). */
export async function prepareRawGas(client: PublicClient, from: Address, to: Address, data: `0x${string}`): Promise<bigint> {
  return gasLimitFrom(await client.estimateGas({ account: from, to, data }));
}
