import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { chainClient } from "@/lib/rpc";
import { AXON_ADDRESS, KNOWN_CHAINS } from "@/lib/chain";
import {
  unsettledWithTx, markSettled, clearTx,
  unresolvedChain, setChainId, countByChain, query, run,
} from "@/lib/server/db";
import { canonicalise } from "@/lib/canonical";
import type { Sample } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

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
async function handlePOST() {
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
  const rows = await unsettledWithTx();
  let settled = 0, cleared = 0;

  for (const row of rows) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: row.tx_hash as `0x${string}` });
      if (receipt.status === "success" && receipt.to?.toLowerCase() === AXON_ADDRESS.toLowerCase()) {
        await markSettled(row.traj_hash, row.tx_hash);
        settled += 1;
      } else {
        await clearTx(row.traj_hash);
        cleared += 1;
      }
    } catch {
      // No such transaction on this chain — the claim does not stand here.
      // Which chain it *does* belong to is settled below.
      await clearTx(row.traj_hash);
      cleared += 1;
    }
  }

  // Establish the chain of every row that has never had one recorded. Each
  // hash is offered to every chain this deployment has used, current first.
  const unresolved = await unresolvedChain();
  const resolved: Record<number, number> = {};
  let unknown = 0;

  for (const row of unresolved) {
    let found = false;
    for (const chain of KNOWN_CHAINS) {
      if (await receiptOn(chain.rpc, row.tx_hash)) {
        await setChainId(row.traj_hash, chain.id);
        resolved[chain.id] = (resolved[chain.id] ?? 0) + 1;
        found = true;
        break;
      }
    }
    // Left NULL. A row no chain will vouch for is not shown anywhere.
    if (!found) unknown += 1;
  }

  const realigned = await realignSamples();

  return NextResponse.json({
    checked: rows.length, settled, cleared,
    chainResolution: { attempted: unresolved.length, resolved, unknown },
    samples: realigned,
    byChain: await countByChain(),
  });
}

/**
 * Make every stored recording exactly what its hash covers.
 *
 * The payout is derived from the artefact, so a row holding more than the hash
 * attests to breaks the only claim this protocol makes. That can happen for a
 * real reason: a run submitted while the serialisation was being extended is
 * hashed by the old rules and stored with the new columns, and afterwards
 * re-derives to a different value for ever.
 *
 * The repair is to drop what the hash does not cover, not to rewrite the hash —
 * the hash is on chain and is the fixed point. A row is only touched when
 * removing a later version's columns makes it re-derive to exactly the value
 * the contract recorded; anything else is left alone and left visibly broken,
 * because a mismatch nobody can explain should stay visible.
 */
async function realignSamples() {
  const suspect = await query<{ traj_hash: string; task_id: number; contributor: string; samples: string; payload_ids: string | null }>(
    `SELECT traj_hash, task_id, contributor, samples, payload_ids FROM trajectory WHERE settled = 1`,
  );

  let checked = 0, repaired = 0;
  const stillBroken: string[] = [];

  for (const row of suspect) {
    checked += 1;
    const samples = JSON.parse(row.samples) as Sample[];
    const ids = row.payload_ids ? (JSON.parse(row.payload_ids) as string[]) : undefined;
    const asIs = keccak256(toHex(canonicalise(row.task_id, row.contributor, samples, ids)));
    if (asIs.toLowerCase() === row.traj_hash.toLowerCase()) continue;

    // Peel back one version at a time, newest first.
    // Destructured out rather than deleted, so the original array is untouched
    // if none of the candidates match and the row is left alone.
    const withoutArm = samples.map((sm) => {
      const copy = { ...sm };
      delete copy.q2;
      delete copy.grip2;
      return copy;
    });
    const candidates: [string, Sample[], string[] | undefined][] = [
      ["without the second arm", withoutArm, ids],
      ["without the second arm or the scene", withoutArm, undefined],
    ];

    let fixed = false;
    for (const [, cand, candIds] of candidates) {
      const h = keccak256(toHex(canonicalise(row.task_id, row.contributor, cand, candIds)));
      if (h.toLowerCase() !== row.traj_hash.toLowerCase()) continue;
      await run(`UPDATE trajectory SET samples = ? WHERE traj_hash = ?`, [
        JSON.stringify(cand), row.traj_hash,
      ]);
      repaired += 1;
      fixed = true;
      break;
    }
    if (!fixed) stillBroken.push(row.traj_hash);
  }

  return { checked, repaired, stillBroken };
}

export const POST = logged("/api/reconcile", handlePOST);
