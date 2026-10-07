import { NextResponse } from "next/server";
import { encodeFunctionData, getAddress, isAddress, isHex, parseEventLogs, type Hex } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { ARC_EXTERNAL, AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { memoIdFor, wrapInMemo } from "@/lib/memo";
import { arc, KeyUnavailable, relayerWallet, withSignerLock } from "@/lib/server/arc";
import { memoLive } from "@/lib/server/memo";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const uint = (v: unknown): bigint | null => (typeof v === "string" && /^\d{1,78}$/.test(v) ? BigInt(v) : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null);

/**
 * Post a task funded by a sponsor's signature, with no gas held by the sponsor.
 *
 * The sponsor signs Circle USDC's EIP-3009 `ReceiveWithAuthorization`
 * (from = sponsor, to = ThenarProtocol, value = escrow) with the nonce the
 * protocol derives from the task's own parameters (`taskNonce`), so the
 * signature is good for exactly this task and nothing else. The relayer key
 * submits `createTaskWithAuthorization` and pays the gas in USDC; the
 * protocol pulls the escrow straight from the sponsor. Where Arc's Memo runs
 * (testnet, mainnet), the call goes through Memo tagged `thenar:task:<nonce>`;
 * on a fork it goes plain.
 *
 * Body: { funder, params: { name, slots, rewardPerTrajectory, scenario,
 * difficulty, expiresAt, amount }, validAfter, validBefore, nonce, signature },
 * numbers as decimal strings, amounts in USDC base units. → { transaction, taskId }.
 */
async function handlePOST(req: Request) {
  if (!IS_DEPLOYED) return bad("ThenarProtocol is not deployed on this network.", 503);
  const gate = rateLimit(`relay-task:${callerKey(req)}`, 5, 60_000);
  if (!gate.ok) return bad("Too many requests. Wait a moment.", 429);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const p = (b?.params ?? {}) as Record<string, unknown>;
  if (typeof b?.funder !== "string" || !isAddress(b.funder)) return bad("funder must be an address");
  if (typeof p.name !== "string" || p.name.trim().length < 3 || p.name.length > 200) return bad("params.name must be 3 to 200 characters");
  const slots = uint(p.slots), reward = uint(p.rewardPerTrajectory), scenario = uint(p.scenario), difficulty = uint(p.difficulty);
  const expiresAt = uint(p.expiresAt), amount = uint(p.amount), validAfter = uint(b.validAfter), validBefore = uint(b.validBefore);
  if (slots === null || slots < BigInt(1) || slots > BigInt(10_000)) return bad("params.slots must be a whole number from 1");
  if (reward === null || reward < BigInt(1)) return bad("params.rewardPerTrajectory must be USDC base units, more than 0");
  if (scenario === null || scenario > BigInt(255) || difficulty === null || difficulty > BigInt(255)) return bad("params.scenario and params.difficulty must be 0 to 255");
  if (expiresAt === null || amount === null || amount < reward) return bad("params.expiresAt must be a unix time (or 0) and params.amount must cover at least one reward");
  if (validAfter === null || validBefore === null) return bad("validAfter and validBefore must be unix times");
  if (validBefore <= BigInt(Math.floor(Date.now() / 1000))) return bad("The authorization has expired (validBefore is in the past).");
  if (typeof b.nonce !== "string" || !isHex(b.nonce) || b.nonce.length !== 66) return bad("nonce must be bytes32");
  if (typeof b.signature !== "string" || !isHex(b.signature)) return bad("signature must be hex");

  const funder = getAddress(b.funder);
  const params = {
    name: p.name, slots: Number(slots), rewardPerTrajectory: reward, scenario: Number(scenario), difficulty: Number(difficulty),
    expiresAt, amount,
  };

  try {
    const [expected, cap] = await Promise.all([
      arc.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskNonce", args: [funder, params] }),
      arc.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "maxTaskEscrow" }),
    ]);
    if ((expected as string).toLowerCase() !== b.nonce.toLowerCase()) {
      return bad(`nonce must be taskNonce(funder, params) = ${expected}; the signature is for different task parameters.`);
    }
    if (amount > (cap as bigint)) return bad(`params.amount is above the protocol's per-task escrow cap (${cap} base units).`);

    const { account, wallet } = relayerWallet();
    const call = encodeFunctionData({
      abi: AXON_ABI, functionName: "createTaskWithAuthorization",
      args: [funder, params, validAfter, validBefore, b.nonce as Hex, b.signature as Hex],
    });
    // The relayer's own call first, so a bad signature or an underfunded sponsor is refused before anything is sent.
    await arc.call({ account, to: AXON_ADDRESS, data: call });
    const tagged = await memoLive();
    const tx = tagged
      ? wrapInMemo({ memo: ARC_EXTERNAL.memo, target: AXON_ADDRESS, data: call, memoId: memoIdFor("task", b.nonce), line: `thenar:task:${funder}` })
      : { to: AXON_ADDRESS, data: call };

    const transaction = await withSignerLock(account.address, async () => {
      const gas = ((await arc.estimateGas({ account, to: tx.to, data: tx.data })) * BigInt(12)) / BigInt(10);
      return wallet.sendTransaction({ account, chain: appChain, to: tx.to, data: tx.data, gas });
    });
    const receipt = await arc.waitForTransactionReceipt({ hash: transaction, timeout: 30_000 });
    if (receipt.status !== "success") return bad(`createTaskWithAuthorization reverted on Arc (${transaction}).`, 502);
    const created = parseEventLogs({ abi: AXON_ABI, logs: receipt.logs, eventName: "TaskCreated" })
      .find((e) => e.address.toLowerCase() === AXON_ADDRESS.toLowerCase());
    if (!created) return bad(`The transaction ${transaction} succeeded but created no task.`, 502);
    return NextResponse.json({ transaction, taskId: Number((created.args as { taskId: bigint }).taskId), memo: tagged });
  } catch (e) {
    if (e instanceof KeyUnavailable) return bad(e.message, 503);
    const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : "the relay failed";
    return bad(`The protocol refused the authorization: ${msg}`, 400);
  }
}

export const POST = logged("/api/relay/create-task", handlePOST);
