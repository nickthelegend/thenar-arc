import "server-only";
import { encodeFunctionData, getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { IS_MAINNET, appChain } from "@/lib/chain";
import {
  BURN_INTENT_DOMAIN, BURN_INTENT_TYPES, GATEWAY_MINTER_ABI, GatewayInputError, burnIntentDepositor, burnIntentFromJson,
  burnIntentRecipient, burnIntentToJson, gatewayFor, type GatewayNetwork,
} from "@/lib/gateway";
import { parseUsdc } from "@/lib/usdc";
import { arc, relayerWallet, withSignerLock } from "@/lib/server/arc";

/**
 * Circle Gateway, server side: a depositor's unified balance, and the mint on
 * Arc of a burn intent they signed. Pure intent building and checking lives
 * in lib/gateway.ts. Ported from polaris-arc / xorv-arc.
 *
 * The relayer can't redirect a cent: the recipient is in the intent the
 * sponsor signed, Circle's operator signs the attestation, and gatewayMint
 * mints only to the recipient it names (no destination caller is set).
 */

export class GatewayError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Gateway for this Arc network. The fork is a fork of testnet, so it uses testnet's Gateway. */
export function gateway(): GatewayNetwork {
  const g = gatewayFor(IS_MAINNET ? "mainnet" : "testnet");
  const override = process.env.CIRCLE_GATEWAY_API_URL?.trim();
  return override ? { ...g, apiUrl: override.replace(/\/$/, "") } : g;
}

async function api(g: GatewayNetwork, path: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${g.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new GatewayError(`Circle Gateway is unreachable: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    const message = typeof json?.message === "string" ? json.message : `Circle Gateway answered ${res.status}`;
    throw new GatewayError(message, res.status >= 500 || !json ? 502 : 400);
  }
  return json;
}

/** Circle answers balances in decimal USDC ("12.5"); keep base units. */
function units(decimal: unknown): bigint {
  const s = String(decimal ?? "0").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return BigInt(0);
  const [w, f = ""] = s.split(".");
  return parseUsdc(`${w}.${f.slice(0, 6) || "0"}`);
}

export type GatewayBalances = { address: Address; total: string; balances: { domain: number; name: string; balance: string }[] };

/** `address`'s Gateway balance on every source domain, USDC base units. */
export async function gatewayBalances(raw: string | null): Promise<GatewayBalances> {
  if (!raw || !isAddress(raw)) throw new GatewayError("address must be an address");
  const address = getAddress(raw);
  const g = gateway();
  const json = await api(g, "/v1/balances", { token: "USDC", sources: g.sources.map((s) => ({ domain: s.domain, depositor: address })) });
  const list = Array.isArray(json.balances) ? (json.balances as { domain: number; balance: string }[]) : [];
  const balances = list.map((b) => ({
    domain: Number(b.domain),
    name: g.sources.find((s) => s.domain === Number(b.domain))?.name ?? `domain ${b.domain}`,
    balance: units(b.balance).toString(),
  }));
  const total = balances.reduce((t, b) => t + BigInt(b.balance), BigInt(0));
  return { address, total: total.toString(), balances };
}

/** Transfers this process has minted, by salt: a retry is answered, not re-minted. */
const minted = new Map<string, { transaction: Hex; recipient: Address; value: string }>();

/**
 * Check a signed burn intent, have Circle attest it, and mint it on Arc from
 * the relayer key. The intent must be one Thenar would have built (to Arc,
 * through Circle's minter, as Arc's USDC, signer = depositor, no caller, no
 * hook, a fee within bounds) and its signature must recover the depositor.
 */
export async function gatewayMint(body: Record<string, unknown> | null): Promise<{ transaction: Hex; recipient: Address; value: string }> {
  const g = gateway();
  let intent;
  try {
    intent = burnIntentFromJson(g, body?.burnIntent);
  } catch (e) {
    if (e instanceof GatewayInputError) throw new GatewayError(e.message, 400);
    throw e;
  }
  const signature = typeof body?.signature === "string" && isHex(body.signature) ? (body.signature as Hex) : null;
  if (!signature) throw new GatewayError("signature must be the depositor's EIP-712 signature of the burn intent");
  const seen = minted.get(intent.spec.salt);
  if (seen) return seen;

  // A bad signature never reaches Circle or costs the relayer anything.
  const signer = await recoverTypedDataAddress({
    domain: BURN_INTENT_DOMAIN, types: BURN_INTENT_TYPES, primaryType: "BurnIntent", message: intent, signature,
  }).catch(() => null);
  if (!signer || getAddress(signer) !== burnIntentDepositor(intent)) {
    throw new GatewayError("The burn intent isn't signed by its depositor.", 400);
  }

  const res = await api(g, "/v1/transfer", [{ burnIntent: burnIntentToJson(intent), signature }]);
  const attestation = res.attestation as Hex | undefined;
  const operatorSig = res.signature as Hex | undefined;
  if (!attestation || !operatorSig || !isHex(attestation) || !isHex(operatorSig)) {
    throw new GatewayError("Circle Gateway returned no attestation.", 502);
  }

  const { account, wallet } = relayerWallet();
  const data = encodeFunctionData({ abi: GATEWAY_MINTER_ABI, functionName: "gatewayMint", args: [attestation, operatorSig] });
  const transaction = await withSignerLock(account.address, async () => {
    const gas = ((await arc.estimateGas({ account, to: g.minter, data })) * BigInt(12)) / BigInt(10);
    return wallet.sendTransaction({ account, chain: appChain, to: g.minter, data, gas });
  });
  const receipt = await arc.waitForTransactionReceipt({ hash: transaction, timeout: 30_000 });
  if (receipt.status !== "success") throw new GatewayError(`gatewayMint reverted on Arc (${transaction}).`, 502);
  const out = { transaction, recipient: burnIntentRecipient(intent), value: intent.spec.value.toString() };
  minted.set(intent.spec.salt, out);
  return out;
}
