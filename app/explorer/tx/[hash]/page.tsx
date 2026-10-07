import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEther, formatGwei, type Hash } from "viem";
import { LOCALNET, appChain, CURRENCY } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";
import { decodeCall, decodeLog, known } from "@/lib/server/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transaction — Thenar explorer" };

const client = chainClient();

/**
 * One transaction, read straight off the node: who sent it, what it called,
 * whether it succeeded, what it cost, and every event it emitted, decoded
 * against the contracts in this repository.
 */
export default async function TxPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  // Monad has Monadscan; this is for the chain nothing else indexes.
  if (!LOCALNET || !/^0x[0-9a-fA-F]{64}$/.test(hash)) notFound();
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: hash as Hash }).catch(() => null),
    client.getTransactionReceipt({ hash: hash as Hash }).catch(() => null),
  ]);
  if (!tx) notFound();
  const block = receipt ? await client.getBlock({ blockNumber: receipt.blockNumber }) : null;
  const call = decodeCall(tx.to, tx.input);
  const ok = receipt?.status === "success";

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <p className="label">{appChain.name} · transaction</p>
      <h1 className="mt-2 break-all font-mono text-[15px] text-scribe">{tx.hash}</h1>
      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-y border-rule py-4 font-mono text-[13px] max-sm:grid-cols-1">
        <dt className="label">Status</dt>
        <dd className={receipt ? (ok ? "text-go" : "text-reject") : "text-scribe-3"}>
          {receipt ? (ok ? "Success" : "Reverted") : "Pending"}
        </dd>
        <dt className="label">Block</dt>
        <dd>{receipt ? `${receipt.blockNumber}${block ? ` · ${new Date(Number(block.timestamp) * 1000).toISOString()}` : ""}` : "—"}</dd>
        <dt className="label">From</dt>
        <dd className="break-all"><Link className="text-probe hover:underline" href={`/explorer/address/${tx.from}`}>{tx.from}</Link></dd>
        <dt className="label">To</dt>
        <dd className="break-all">
          {tx.to ? (
            <Link className="text-probe hover:underline" href={`/explorer/address/${tx.to}`}>
              {tx.to}{known(tx.to) ? ` (${known(tx.to)!.name})` : ""}
            </Link>
          ) : receipt?.contractAddress ? (
            <>Created <Link className="text-probe hover:underline" href={`/explorer/address/${receipt.contractAddress}`}>{receipt.contractAddress}</Link></>
          ) : "—"}
        </dd>
        <dt className="label">Value</dt>
        <dd>{formatEther(tx.value)} {CURRENCY}</dd>
        <dt className="label">Gas</dt>
        <dd>
          {receipt ? `${receipt.gasUsed} used of ${tx.gas}` : `${tx.gas} limit`}
          {receipt?.effectiveGasPrice ? ` · ${formatGwei(receipt.effectiveGasPrice)} gwei · ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} ${CURRENCY}` : ""}
        </dd>
        <dt className="label">Nonce</dt>
        <dd>{tx.nonce}</dd>
      </dl>

      {call ? (
        <section className="mt-6">
          <p className="label">Call</p>
          <p className="mt-2 font-mono text-[13px] text-scribe">{call.contract}.{call.fn}</p>
          {call.args.length ? (
            <ol className="mt-2 flex flex-col gap-1 font-mono text-[12px] text-scribe-2">
              {call.args.map((a, i) => <li key={i} className="break-all">{i}: {a}</li>)}
            </ol>
          ) : null}
        </section>
      ) : null}

      {receipt?.logs.length ? (
        <section className="mt-6">
          <p className="label">Events ({receipt.logs.length})</p>
          <ol className="mt-2 flex flex-col gap-3">
            {receipt.logs.map((l) => {
              const d = decodeLog(l.address, l.data, l.topics);
              return (
                <li key={l.logIndex} className="border border-rule p-3 font-mono text-[12px]">
                  <p className="text-scribe">{d.contract ?? l.address} · {d.event}</p>
                  {Object.entries(d.args).map(([k, v]) => (
                    <p key={k} className="mt-1 break-all text-scribe-2">{k}: {v}</p>
                  ))}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
