import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { getAddress, parseEventLogs } from "viem";

import { AXON_ABI } from "@/lib/abi";

import { chainClient } from "@/lib/rpc";
import { AXON_ADDRESS, appChain } from "@/lib/chain";
import { getTrajectory, markSettled } from "@/lib/server/db";
import { queryOne } from "@/lib/server/sql";
import { isOperator } from "@/lib/server/operator";
import { issueShares, refusal, sharesFor, TokenError } from "@/lib/server/corpus-shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

/**
 * Record the transaction that settled a run.
 *
 * The hash is not taken on trust. A reverted transaction has a perfectly valid
 * hash, and recording those made task pages list runs the contract had never
 * accepted — twenty submissions against four filled slots. So the receipt is
 * read back and has to say success, against this contract, before anything is
 * written.
 */
async function handlePOST(req: Request) {
  let trajHash: string, txHash: string;
  try {
    ({ trajHash, txHash } = await req.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(trajHash ?? "")) {
    return NextResponse.json({ error: "trajHash must be a 32-byte hash" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash ?? "")) {
    return NextResponse.json({ error: "txHash must be a 32-byte hash" }, { status: 400 });
  }

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return NextResponse.json(
      { error: `no such transaction on ${appChain.name}` },
      { status: 409 },
    );
  }

  if (receipt.status !== "success") {
    return NextResponse.json({ error: "that transaction reverted" }, { status: 409 });
  }
  // Not `receipt.to`: a run whose gas Privy sponsored reaches the protocol
  // through the operator's own delegated account, so the transaction is
  // addressed to that account. What counts is that the protocol emitted it.
  if (!receipt.logs.some((l) => l.address.toLowerCase() === AXON_ADDRESS.toLowerCase())) {
    return NextResponse.json(
      { error: "that transaction did not reach the protocol" },
      { status: 409 },
    );
  }

  // Hashes are stored lowercase; the same spelling settles the row and names
  // its shares, or one could happen without the other.
  const hash = trajHash.toLowerCase();

  // A successful transaction to the protocol is not yet this run's. Any of
  // them would have settled any stored hash, and issued it shares, until the
  // receipt had to carry the TrajectoryAccepted log for exactly this run.
  const accepted = parseEventLogs({ abi: AXON_ABI, logs: receipt.logs, eventName: "TrajectoryAccepted" })
    .some((l) => l.address.toLowerCase() === AXON_ADDRESS.toLowerCase()
      && String((l.args as { trajHash?: string }).trajHash).toLowerCase() === hash);
  if (!accepted) {
    return NextResponse.json(
      { error: "that transaction did not record this run" },
      { status: 409 },
    );
  }

  if (!(await getTrajectory(hash))) {
    return NextResponse.json({ error: "no run with that hash is stored here" }, { status: 404 });
  }

  await markSettled(hash, txHash.toLowerCase());

  // The run is paid by the protocol; its share of the corpus is issued by
  // CorpusShares, a second Monad transaction that settles a moment later.
  const shares = await issueRunShares(hash);
  return NextResponse.json({ ok: true, block: Number(receipt.blockNumber), shares });
}

export type RunShares =
  | { issued: true; tx: string; units?: string; already?: boolean }
  | { issued: false; reason: string };

/**
 * Issue one settled run's shares to the human who drove it.
 *
 * Once per run however many times this route is called, found by the run's
 * hash in the token log. A failure is reported rather than retried here: the
 * payout already happened, and the response says the share did not.
 */
async function issueRunShares(trajHash: string): Promise<RunShares> {
  const stored = await getTrajectory(trajHash);
  if (!stored) return { issued: false, reason: "no stored trajectory for this hash" };
  if (!(await isOperator(stored.contributor))) {
    return { issued: false, reason: "the contributor is not on the CorpusShares whitelist" };
  }

  const prior = await queryOne<{ tx: string }>(
    `SELECT tx FROM token_event WHERE kind = 'issue' AND detail = ?`, [trajHash],
  );
  if (prior) return { issued: true, tx: prior.tx, already: true };

  const units = sharesFor(stored.score);
  try {
    const tx = await issueShares(getAddress(stored.contributor), units, trajHash);
    return { issued: true, tx, units: units.toString() };
  } catch (e) {
    const rule = refusal(e);
    return {
      issued: false,
      reason: e instanceof TokenError ? e.message : rule ? `the security refused: ${rule}` : e instanceof Error ? e.message : "unknown",
    };
  }
}

export const POST = logged("/api/submitted", handlePOST);
