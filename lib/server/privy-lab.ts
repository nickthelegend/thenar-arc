import "server-only";
import { PrivyClient } from "@privy-io/node";
import { encodeFunctionData, parseEventLogs, parseAbi, toHex, type Hex } from "viem";
import { chainClient } from "../rpc";
import { AXON_ADDRESS, USDC, appChain } from "@/lib/chain";
import { USDC_ABI } from "@/lib/usdc";

/**
 * A lab's data budget, in a Privy wallet that can only fund Thenar.
 *
 * The wallet and its policy are created by scripts/privy-lab.mjs. The policy
 * allows exactly two kinds of transaction on Arc, carrying no native value:
 *  - `USDC.approve(ThenarProtocol, amount)` with `amount` at most LAB_LIMIT;
 *  - a call to ThenarProtocol's `createTask*`, which pulls that approved USDC
 *    into a new task's escrow.
 * Privy refuses to sign anything else, so the budget cannot be spent on
 * anything but bounties by anyone holding this server's credentials,
 * including this server. On Arc the budget and the gas are both USDC: the
 * ERC-20 is the same balance as the native gas token.
 *
 * Privy signs and Arc's RPC broadcasts. The policy is enforced at signing,
 * which is where it has to be: a signature is all anyone needs to spend.
 */

/** Mirrors the policy's approve ceiling, USDC base units (6 dec): 10 USDC. The policy is what enforces it. */
export const LAB_LIMIT = BigInt(10_000_000);

export type Lab = {
  privy: PrivyClient;
  appId: string;
  appSecret: string;
  walletId: string;
  address: `0x${string}`;
  policyId: string;
};

let lab: Lab | null = null;

export function labConfig(): Lab | null {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const walletId = process.env.PRIVY_LAB_WALLET_ID;
  const address = process.env.PRIVY_LAB_WALLET_ADDRESS;
  const policyId = process.env.PRIVY_LAB_POLICY_ID;
  if (!appId || !appSecret || !walletId || !address || !policyId) return null;
  lab ??= {
    privy: new PrivyClient({ appId, appSecret }),
    appId, appSecret, walletId, policyId,
    address: address as `0x${string}`,
  };
  return lab;
}

const client = chainClient();

const abi = parseAbi([
  "function createTaskUntil(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty, uint64 expiresAt, uint256 amount) returns (uint256)",
  "function taskCount() view returns (uint256)",
  "event TaskCreated(uint256 indexed taskId, address indexed funder, string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty)",
]);

/** Privy's policy engine declined to sign. Not an outage: the control working. */
export class PolicyRefusal extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** Priced and nonced from Arc, signed by Privy under the lab's policy, broadcast to Arc. Never carries native value. */
async function signAndSend(l: Lab, to: `0x${string}`, data: Hex): Promise<Hex> {
  const [nonce, gas, fees] = await Promise.all([
    client.getTransactionCount({ address: l.address, blockTag: "pending" }),
    client.estimateGas({ account: l.address, to, data }),
    client.estimateFeesPerGas(),
  ]);

  let signed: string;
  try {
    const r = await l.privy.wallets().ethereum().signTransaction(l.walletId, {
      params: {
        transaction: {
          to, value: "0x0", chain_id: appChain.id, nonce, type: 2,
          // Arc charges the gas used, not the limit; the margin only guards against estimate drift.
          gas_limit: toHex((gas * BigInt(12)) / BigInt(10)),
          max_fee_per_gas: toHex(fees.maxFeePerGas),
          max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas),
          data,
        },
      },
    });
    signed = r.signed_transaction;
  } catch (e) {
    const body = (e as { error?: { error?: string; code?: string } }).error;
    if (body?.code === "policy_violation") {
      throw new PolicyRefusal(body.error ?? "denied by the wallet's policy", body.code);
    }
    throw e;
  }
  return client.sendRawTransaction({ serializedTransaction: signed as Hex });
}

export type LabPolicy = {
  id: string;
  name: string;
  chain_type: string;
  rules: Array<{
    name: string;
    method: string;
    action: string;
    conditions: Array<{ field_source: string; field: string; operator: string; value: unknown }>;
  }>;
};

/** The policy as Privy holds it, not as this file describes it. */
async function readPolicy(l: Lab): Promise<LabPolicy> {
  const res = await fetch(`https://api.privy.io/v1/policies/${l.policyId}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${l.appId}:${l.appSecret}`).toString("base64")}`,
      "privy-app-id": l.appId,
      "user-agent": "thenar-arc/0.1",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Privy answered ${res.status} for the lab's policy`);
  return res.json();
}

export async function labState(l: Lab) {
  const [balance, allowance, policy] = await Promise.all([
    client.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [l.address] }),
    client.readContract({ address: USDC, abi: USDC_ABI, functionName: "allowance", args: [l.address, AXON_ADDRESS] }),
    readPolicy(l),
  ]);
  return {
    configured: true,
    wallet: { id: l.walletId, address: l.address },
    /** USDC base units (6 dec). The same balance pays the gas. */
    balance: balance.toString(),
    /** What the protocol may still pull from the lab's wallet, USDC base units. */
    allowance: allowance.toString(),
    /** The policy's approve ceiling, USDC base units. */
    limit: LAB_LIMIT.toString(),
    decimals: 6,
    chainId: appChain.id,
    policy,
  };
}

export type Bounty = {
  name: string;
  slots: number;
  /** USDC base units (6 dec) per accepted run. */
  reward: bigint;
  scenario: number;
  difficulty: number;
  days: number;
};

async function confirmed(hash: Hex, what: string) {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") {
    throw new Error(`The ${what} transaction reverted on ${appChain.name} (${hash}), so no task was posted and nothing was escrowed.`);
  }
  return receipt;
}

/**
 * A bounty posted from the lab's budget: USDC escrowed in the protocol, on Arc.
 * Two transactions, both signed by Privy under the policy: approve exactly
 * the escrow (skipped if the allowance already covers it), then createTaskUntil.
 */
export async function postBounty(l: Lab, b: Bounty) {
  const amount = b.reward * BigInt(b.slots);
  const allowance = await client.readContract({
    address: USDC, abi: USDC_ABI, functionName: "allowance", args: [l.address, AXON_ADDRESS],
  });
  let approval: Hex | null = null;
  if (allowance < amount) {
    approval = await signAndSend(l, USDC, encodeFunctionData({ abi: USDC_ABI, functionName: "approve", args: [AXON_ADDRESS, amount] }));
    await confirmed(approval, "USDC approval");
  }
  const data = encodeFunctionData({
    abi, functionName: "createTaskUntil",
    args: [b.name, b.slots, b.reward, b.scenario, b.difficulty, BigInt(Math.floor(Date.now() / 1000) + b.days * 86400), amount],
  });
  const hash = await signAndSend(l, AXON_ADDRESS as `0x${string}`, data);
  const receipt = await confirmed(hash, "bounty");
  // The task's id is the one this transaction created, read from its own
  // TaskCreated log; taskCount - 1 could name somebody else's task posted in
  // the same block.
  const created = parseEventLogs({ abi, logs: receipt.logs, eventName: "TaskCreated" })
    .find((e) => e.address.toLowerCase() === AXON_ADDRESS.toLowerCase());
  if (!created) throw new Error(`The bounty transaction ${hash} succeeded but created no task.`);
  const taskId = Number(created.args.taskId);
  return { hash, approval, status: receipt.status, taskId, escrow: amount.toString() };
}

/**
 * Ask the lab's wallet to move 0.01 USDC somewhere the policy does not allow
 * (a plain USDC transfer to `to`).
 *
 * Expected to throw PolicyRefusal. If Privy ever signed it, the transaction is
 * broadcast and its hash returned, because a control that silently stopped
 * working should be visible, not hidden behind a message that says it worked.
 */
export async function probePolicy(l: Lab, to: `0x${string}`): Promise<Hex> {
  return signAndSend(l, USDC, encodeFunctionData({ abi: USDC_ABI, functionName: "transfer", args: [to, BigInt(10_000)] }));
}
