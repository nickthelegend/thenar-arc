import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { AXON_ADDRESS, monadTestnet } from "@/lib/chain";
import { unsettledWithTx, markSettled, clearTx } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: monadTestnet, transport: http() });

/**
 * Hold the stored ledger to the chain.
 *
 * Rows written before settlement was verified carry a transaction hash that may
 * belong to a reverted call. This asks the chain about each one and either
 * marks it settled or drops the hash. It only ever reads the chain, so it can
 * confirm and retract but never invent — running it twice changes nothing.
 */
export async function POST() {
  const rows = unsettledWithTx();
  let settled = 0, cleared = 0;

  for (const row of rows) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: row.tx_hash as `0x${string}` });
      if (receipt.status === "success" && receipt.to?.toLowerCase() === AXON_ADDRESS.toLowerCase()) {
        markSettled(row.traj_hash, row.tx_hash);
        settled += 1;
      } else {
        clearTx(row.traj_hash);
        cleared += 1;
      }
    } catch {
      // No such transaction on chain — the claim does not stand.
      clearTx(row.traj_hash);
      cleared += 1;
    }
  }

  return NextResponse.json({ checked: rows.length, settled, cleared });
}
