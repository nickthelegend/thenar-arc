import "server-only";
import { keccak256, toHex, zeroAddress, type Address } from "viem";
import { SALES_LOG, isAddress } from "@/lib/chain";
import { SALES_LOG_ABI } from "@/lib/registry-abi";
import { issuerWallet, arc, withSignerLock } from "@/lib/server/arc";
import type { CorpusSale, SaleAudit } from "./agent-sales";

/**
 * Every pull, stated on Arc by the seller.
 *
 * The sales table is this server's word, and a server can edit its own table.
 * A line in SalesLog, which only the seller's key can write, is the same
 * statement with a block and a sequence number nobody here can change
 * afterwards. It carries the sha256 of the exact bytes served, so a buyer can
 * hash the file they received and ask the contract whether it was sold —
 * `servedCount(sha256)` — without trusting this server's answer.
 *
 * The seller is the corpus issuer, the same key that issues shares: see
 * lib/server/arc.ts for why it is not the verifier.
 */

/** A sale id as the contract keys it: a settlement tx hash as is, anything else hashed. */
export const saleKey = (id: string): `0x${string}` =>
  /^0x[0-9a-fA-F]{64}$/.test(id) ? (id as `0x${string}`) : keccak256(toHex(id));

/** SalesLog's Terms enum. */
export const TERMS = { x402: 0, licence: 1, gateway: 2 } as const;

/**
 * Null when no SalesLog is deployed; throws when one is and the write fails.
 * `buyerAgent` is the buyer's ERC-8004 agent id when it proved it holds one;
 * the contract stores id + 1 so that 0 can mean "not an agent".
 */
export async function publishSale(sale: CorpusSale, sha256: string, buyerAgent: bigint | null = null): Promise<SaleAudit | null> {
  if (!isAddress(SALES_LOG)) return null;
  const { account, wallet } = issuerWallet();

  const buyer = sale.buyer && isAddress(sale.buyer) ? (sale.buyer as Address) : zeroAddress;
  const { request, result } = await arc.simulateContract({
    account,
    address: SALES_LOG,
    abi: SALES_LOG_ABI,
    functionName: "logSale",
    args: [
      saleKey(sale.id),
      BigInt(sale.task_id),
      sale.method === "x402" ? TERMS.x402 : TERMS.licence,
      buyer,
      sale.asset && isAddress(sale.asset) ? (sale.asset as Address) : zeroAddress,
      BigInt(sale.amount ?? "0"),
      `0x${sha256}`,
      buyerAgent === null ? BigInt(0) : buyerAgent + BigInt(1),
    ],
  });
  const transaction = await withSignerLock(account.address, () => wallet.writeContract(request));
  const receipt = await arc.waitForTransactionReceipt({ hash: transaction, timeout: 30_000 });
  if (receipt.status !== "success") throw new Error(`logSale reverted on Arc (${transaction})`);
  return { contract: SALES_LOG, sequence: Number(result), transaction };
}
