import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { getAddress } from "viem";

import { chainClient } from "@/lib/rpc";
import { AXON_ADDRESS, appChain } from "@/lib/chain";
import { getTrajectory, markSettled } from "@/lib/server/db";
import { queryOne } from "@/lib/server/sql";
import { humanFor } from "@/lib/server/world-id";
import { issueShares, refusal, sharesFor, TokenError } from "@/lib/server/ats";

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
  if (receipt.to?.toLowerCase() !== AXON_ADDRESS.toLowerCase()) {
    return NextResponse.json(
      { error: "that transaction was not sent to the protocol" },
      { status: 409 },
    );
  }

  await markSettled(trajHash, txHash);

  // The run is paid on Arc; its share of the corpus is issued on Hedera.
  const shares = await issueRunShares(trajHash.toLowerCase());
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
  if (!(await humanFor(stored.contributor))) {
    return { issued: false, reason: "the contributor has no World ID proof on file" };
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
