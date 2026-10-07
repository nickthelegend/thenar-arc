import "server-only";
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type { Network, PaymentPayload, PaymentRequirements, SupportedResponse } from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import type { Abi, Hex } from "viem";
import { appChain } from "@/lib/chain";
import { arc, facilitatorWallet, withSignerLock } from "@/lib/server/arc";

/**
 * Thenar's own x402 facilitator, in this process.
 *
 * Arc has no public x402 facilitator, so the corpus paywall settles its own
 * payments: an agent signs Circle USDC's EIP-3009 `transferWithAuthorization`
 * (buyer → corpus treasury, one cent), and this submits it from
 * X402_FACILITATOR_PRIVATE_KEY, paying the gas in USDC. The key holds a
 * little USDC for gas and none of the buyers' money: the transfer goes
 * straight from the agent to the treasury, and the authorization names both.
 *
 * Built from x402's own facilitator library (`x402Facilitator` with the EVM
 * `exact` scheme), wrapped in the `FacilitatorClient` surface the resource
 * server expects — the same surface `HTTPFacilitatorClient` has — so the
 * paywall cannot tell an in-process facilitator from a hosted one.
 *
 * Every write goes through the key's lock, so two concurrent settlements
 * cannot race for a nonce. Arc's finality is deterministic: the receipt that
 * comes back is final.
 */

/** How long settlement waits for the transfer's receipt. Arc includes in under a second; 30 s is RPC slack. */
const CONFIRMATION_TIMEOUT_MS = 30_000;

export const X402_NETWORK = `eip155:${appChain.id}` as Network;

let client: FacilitatorClient | null = null;

function log(line: string) {
  console.error(`[x402] ${line}`);
}

/** The facilitator, built once per process. Throws KeyUnavailable when X402_FACILITATOR_PRIVATE_KEY is unset. */
export function inProcessFacilitator(): FacilitatorClient {
  if (client) return client;
  const { account, wallet } = facilitatorWallet();

  const signer = toFacilitatorEvmSigner(
    {
      address: account.address,
      getCode: (a) => arc.getCode(a),
      readContract: (a) =>
        arc.readContract({ address: a.address, abi: a.abi as Abi, functionName: a.functionName, args: (a.args ?? []) as unknown[] }),
      verifyTypedData: (a) => arc.verifyTypedData(a as Parameters<typeof arc.verifyTypedData>[0]),
      writeContract: (a) =>
        withSignerLock(account.address, async () => {
          const request = {
            account, chain: appChain, address: a.address, abi: a.abi as Abi, functionName: a.functionName,
            args: a.args as unknown[], ...(a.dataSuffix ? { dataSuffix: a.dataSuffix } : {}),
          };
          const gas = a.gas ?? ((await arc.estimateContractGas(request)) * BigInt(12)) / BigInt(10);
          return wallet.writeContract({ ...request, gas });
        }),
      sendTransaction: (a) =>
        withSignerLock(account.address, async () => {
          const gas = ((await arc.estimateGas({ account, to: a.to, data: a.data })) * BigInt(12)) / BigInt(10);
          return wallet.sendTransaction({ account, chain: appChain, to: a.to, data: a.data as Hex, gas });
        }),
      waitForTransactionReceipt: (a) => arc.waitForTransactionReceipt(a),
    },
    { confirmationTimeoutMs: CONFIRMATION_TIMEOUT_MS },
  );

  const facilitator = new x402Facilitator().register(X402_NETWORK, new ExactEvmScheme(signer));

  client = {
    async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
      const r = await facilitator.verify(payload, requirements);
      if (!r.isValid) {
        log(`payment rejected: ${r.invalidReason ?? "unknown"}${r.invalidMessage ? ` (${r.invalidMessage})` : ""} payer=${r.payer ?? "?"} amount=${requirements.amount} payTo=${requirements.payTo}`);
      }
      return r;
    },
    async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
      const r = await facilitator.settle(payload, requirements);
      if (!r.success) log(`settlement failed: ${r.errorReason ?? "unknown"}${r.errorMessage ? ` (${r.errorMessage})` : ""} payer=${r.payer ?? "?"} tx=${r.transaction ?? "-"}`);
      return r;
    },
    async getSupported() {
      return facilitator.getSupported() as SupportedResponse;
    },
  };
  return client;
}

/** The facilitator's address, for /api/arc; null when its key is not set. */
export function facilitatorAddress(): string | null {
  try {
    return facilitatorWallet().account.address;
  } catch {
    return null;
  }
}
