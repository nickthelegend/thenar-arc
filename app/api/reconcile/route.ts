import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { AXON_ADDRESS, appChain, KNOWN_CHAINS } from "@/lib/chain";
import {
  unsettledWithTx, markSettled, clearTx,
  unresolvedChain, setChainId, countByChain,
} from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: appChain, transport: http() });

/** A receipt lookup against an arbitrary chain, by URL rather than by config,
 *  because the prior chains are no longer part of the app's wagmi setup. */
async function receiptOn(rpc: string, hash: string): Promise<boolean> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.result != null;
  } catch {
    return false;
  }
}

/**
 * Hold the stored ledger to the chain.
 *
 * Two things are established here, both by asking a chain rather than by
 * assuming. First, whether a row with a transaction hash actually settled —
 * a hash on its own proves nothing, a reverted call has one too. Second, which
 * chain that transaction is on: this deployment has run on more than one, and
 * the rows came across with it. Guessing the second is what put transactions on
 * the public feed that the current chain has never heard of.
 *
 * It only ever reads, so it can confirm and retract but never invent. Running
 * it twice changes nothing.
 */
export async function POST() {
  return reconcile();
}

/**
 * The same work on a schedule.
 *
 * Nothing was calling this route, which meant a row could sit unverified
 * indefinitely and the ledger could drift from the chain without anyone
 * noticing until it showed up on the feed. Vercel's scheduler only issues GET,
 * hence this. It is safe to expose: every write it makes is a fact a chain
 * returned, so the worst an unsolicited call can do is re-confirm the truth.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  return reconcile();
}

async function reconcile() {
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
      // No such transaction on this chain — the claim does not stand here.
      // Which chain it *does* belong to is settled below.
      clearTx(row.traj_hash);
      cleared += 1;
    }
  }

  // Establish the chain of every row that has never had one recorded. Each
  // hash is offered to every chain this deployment has used, current first.
  const unresolved = unresolvedChain();
  const resolved: Record<number, number> = {};
  let unknown = 0;

  for (const row of unresolved) {
    let found = false;
    for (const chain of KNOWN_CHAINS) {
      if (await receiptOn(chain.rpc, row.tx_hash)) {
        setChainId(row.traj_hash, chain.id);
        resolved[chain.id] = (resolved[chain.id] ?? 0) + 1;
        found = true;
        break;
      }
    }
    // Left NULL. A row no chain will vouch for is not shown anywhere.
    if (!found) unknown += 1;
  }

  return NextResponse.json({
    checked: rows.length, settled, cleared,
    chainResolution: { attempted: unresolved.length, resolved, unknown },
    byChain: countByChain(),
  });
}
