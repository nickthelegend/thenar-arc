import "server-only";
import { PrivyClient } from "@privy-io/node";
import { encodeFunctionData, parseAbi, toHex, type Hex } from "viem";
import { chainClient } from "../rpc";
import { AXON_ADDRESS, appChain } from "@/lib/chain";

/**
 * A lab's data budget, in a Privy wallet that can only fund Thenar.
 *
 * The wallet and its policy are created by scripts/privy-lab.mjs. The policy
 * allows exactly one kind of transaction — to AxonProtocolV2, on Arc, carrying
 * at most one USDC — and Privy refuses to sign anything else, so the budget
 * cannot be spent on anything but bounties by anyone holding this server's
 * credentials, including this server.
 *
 * Privy signs and Arc's RPC broadcasts: Privy will not broadcast on Arc for this
 * app, but the policy is enforced at signing, which is where it has to be.
 */

/** Mirrors the policy's value condition. The policy is what enforces it. */
export const LAB_LIMIT_WEI = 10n ** 18n;

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
  "function createTaskUntil(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty, uint64 expiresAt) payable returns (uint256)",
  "function taskCount() view returns (uint256)",
]);

/** Privy's policy engine declined to sign. Not an outage: the control working. */
export class PolicyRefusal extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** Priced and nonced from Arc, signed by Privy under the lab's policy, broadcast to Arc. */
async function signAndSend(l: Lab, to: `0x${string}`, value: bigint, data?: Hex): Promise<Hex> {
  const [nonce, gas, fees] = await Promise.all([
    client.getTransactionCount({ address: l.address, blockTag: "pending" }),
    client.estimateGas({ account: l.address, to, value, data }),
    client.estimateFeesPerGas(),
  ]);

  let signed: string;
  try {
    const r = await l.privy.wallets().ethereum().signTransaction(l.walletId, {
      params: {
        transaction: {
          to, value: toHex(value), chain_id: appChain.id, nonce, type: 2,
          gas_limit: toHex((gas * 12n) / 10n),
          max_fee_per_gas: toHex(fees.maxFeePerGas),
          max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas),
          ...(data ? { data } : {}),
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
      "user-agent": "thenar-arc/0.1 (+https://github.com/nickthelegend/thenar-arc)",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Privy answered ${res.status} for the lab's policy`);
  return res.json();
}

export async function labState(l: Lab) {
  const [balance, policy] = await Promise.all([client.getBalance({ address: l.address }), readPolicy(l)]);
  return {
    wallet: { id: l.walletId, address: l.address },
    balanceWei: balance.toString(),
    limitWei: LAB_LIMIT_WEI.toString(),
    chainId: appChain.id,
    policy,
  };
}

export type Bounty = {
  name: string;
  slots: number;
  rewardWei: bigint;
  scenario: number;
  difficulty: number;
  days: number;
};

/** A bounty posted from the lab's budget: USDC escrowed in the protocol, on Arc. */
export async function postBounty(l: Lab, b: Bounty) {
  const value = b.rewardWei * BigInt(b.slots);
  const data = encodeFunctionData({
    abi, functionName: "createTaskUntil",
    args: [b.name, b.slots, b.rewardWei, b.scenario, b.difficulty, BigInt(Math.floor(Date.now() / 1000) + b.days * 86400)],
  });
  const hash = await signAndSend(l, AXON_ADDRESS as `0x${string}`, value, data);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  const count = await client.readContract({ address: AXON_ADDRESS as `0x${string}`, abi, functionName: "taskCount" });
  return { hash, status: receipt.status, taskId: Number(count) - 1, escrowWei: value.toString() };
}

/**
 * Ask the lab's wallet to move a cent of USDC somewhere the policy does not allow.
 *
 * Expected to throw PolicyRefusal. If Privy ever signed it, the transaction is
 * broadcast and its hash returned, because a control that silently stopped
 * working should be visible, not hidden behind a message that says it worked.
 */
export async function probePolicy(l: Lab, to: `0x${string}`): Promise<Hex> {
  return signAndSend(l, to, 10n ** 16n);
}
