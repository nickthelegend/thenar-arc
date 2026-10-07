import { encodeFunctionData, getAddress, keccak256, parseAbi, stringToBytes, toHex, type Address, type Hex } from "viem";

/**
 * Arc's Memo extension: a payment that says what it paid for.
 *
 * `Memo.memo(target, data, memoId, memoData)` calls `target` with `data` *as
 * the transaction's EOA sender* (Arc's CallFrom precompile), then emits
 * `Memo(sender, target, callDataHash, memoId, memo, memoIndex)`. So a run
 * submitted through Memo is still the operator's own submit — ThenarProtocol
 * sees the operator as `msg.sender` and pays them — and the chain also
 * records, indexed, which run the USDC was for.
 *
 * Thenar tags every payout with `memoId = trajHash` (the run id: keccak256 of
 * the recorded trajectory, the same value ThenarProtocol keys the run by and
 * ThenarVerdicts writes as the ERC-8004 feedbackHash) and a readable line,
 * `thenar:run:<task>:<score>`. Anyone can follow a run's money with one
 * `eth_getLogs` on Memo filtered by that id.
 *
 * Memo needs the transaction's sender to be an EOA and forwards no value.
 * Whether the node executes CallFrom is probed, not assumed (lib/server or the
 * client calls `memoProbeCall` once): a local Arc fork's RPC does not, so
 * there runs go out as plain calls and the receipt says "untagged".
 *
 * Pure and browser-safe. Pattern from juno-arc / xorv-arc.
 */

export const MEMO_ADDRESS: Address = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";

export const MEMO_ABI = parseAbi([
  "function memo(address target, bytes data, bytes32 memoId, bytes memo)",
  "function memoIndex() view returns (uint256)",
  "event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)",
  "error CallFailed(bytes returnData)",
]);

/** `Memo.CallFailed(bytes)`: Memo wraps the target's revert in it. */
export const MEMO_CALL_FAILED: Hex = "0xed1966a2";

/** The readable line stored with a payout. Kept short: it is calldata. */
export function runMemoLine(taskId: bigint | number, score: number): string {
  return `thenar:run:${taskId}:${score}`.slice(0, 96);
}

/** A memo id for something that is not a run (a licence order, a sale). */
export const memoIdFor = (kind: string, id: string | number | bigint) => keccak256(stringToBytes(`thenar:${kind}:${id}`));

/** A call, re-addressed to Memo with its tag. Pure. */
export function wrapInMemo(params: { memo?: Address; target: Address; data: Hex; memoId: Hex; line: string }): { to: Address; data: Hex } {
  return {
    to: getAddress(params.memo ?? MEMO_ADDRESS),
    data: encodeFunctionData({
      abi: MEMO_ABI,
      functionName: "memo",
      args: [getAddress(params.target), params.data, params.memoId, toHex(stringToBytes(params.line))],
    }),
  };
}

/*
 * The probe: an eth_call of Memo wrapping a USDC transfer that must fail as
 * the caller (0x…dEaD sending a billion USDC it does not have). Where CallFrom
 * runs, the transfer is attempted *as that caller* and its revert comes back
 * wrapped in Memo's `CallFailed(bytes)`, proof the inner call ran with the
 * right sender. Anything else (no code at Memo, a node that doesn't execute
 * the precompile, a success) is "not live".
 */
export const MEMO_PROBE_FROM: Address = "0x000000000000000000000000000000000000dEaD";

export function memoProbeCall(usdc: Address, memo: Address = MEMO_ADDRESS): { to: Address; data: Hex; from: Address } {
  const transfer = encodeFunctionData({
    abi: parseAbi(["function transfer(address to, uint256 value) returns (bool)"]),
    functionName: "transfer",
    args: ["0x0000000000000000000000000000000000000001", 1_000_000_000_000_000n],
  });
  const wrapped = wrapInMemo({ memo, target: usdc, data: transfer, memoId: keccak256(stringToBytes("thenar:probe")), line: "probe" });
  return { ...wrapped, from: MEMO_PROBE_FROM };
}

/** Did the probe's revert carry the inner call's own revert, wrapped by Memo? */
export function probeRevertProvesCallFrom(revertData: string | null | undefined): boolean {
  if (!revertData || !revertData.toLowerCase().startsWith(MEMO_CALL_FAILED)) return false;
  const body = revertData.slice(10);
  if (body.length < 128) return false;
  return BigInt(`0x${body.slice(64, 128)}`) > 0n;
}

/** The revert data inside a viem error, wherever the transport put it. */
export function revertDataOf(error: unknown): string | null {
  let found: string | null = null;
  const visit = (e: unknown, depth: number) => {
    if (!e || depth > 8 || found) return;
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x")) found = data;
    else if (data && typeof data === "object" && typeof (data as { data?: unknown }).data === "string") found = (data as { data: string }).data;
    const raw = (e as { raw?: unknown }).raw;
    if (!found && typeof raw === "string" && raw.startsWith("0x")) found = raw;
    visit((e as { cause?: unknown }).cause, depth + 1);
  };
  visit(error, 0);
  if (!found) {
    const match = /(0xed1966a2[0-9a-fA-F]*)/.exec(String((error as Error)?.message ?? ""));
    if (match) found = match[1];
  }
  return found;
}

/** Ask a node whether it executes Memo's CallFrom. Never throws; false on any doubt. */
export async function probeMemo(client: { call: (a: { account: Address; to: Address; data: Hex }) => Promise<unknown> }, usdc: Address, memo: Address = MEMO_ADDRESS): Promise<boolean> {
  const c = memoProbeCall(usdc, memo);
  try {
    await client.call({ account: c.from, to: c.to, data: c.data });
    return false;
  } catch (e) {
    return probeRevertProvesCallFrom(revertDataOf(e));
  }
}
