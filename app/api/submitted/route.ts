import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { AXON_ADDRESS, monadTestnet } from "@/lib/chain";
import { markSettled } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: monadTestnet, transport: http() });

/**
 * Record the transaction that settled a run.
 *
 * The hash is not taken on trust. A reverted transaction has a perfectly valid
 * hash, and recording those made task pages list runs the contract had never
 * accepted — twenty submissions against four filled slots. So the receipt is
 * read back and has to say success, against this contract, before anything is
 * written.
 */
export async function POST(req: Request) {
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
      { error: "no such transaction on Monad Testnet" },
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

  markSettled(trajHash, txHash);
  return NextResponse.json({ ok: true, block: Number(receipt.blockNumber) });
}
