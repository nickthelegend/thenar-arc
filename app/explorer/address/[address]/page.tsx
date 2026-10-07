import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { erc20Abi, formatEther, formatUnits, getAddress, type Address } from "viem";
import { LOCALNET, appChain, CURRENCY, USDC } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";
import { decodeCall, known } from "@/lib/server/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Address — Thenar explorer" };

const client = chainClient();
/** How far back the transaction list looks. A local chain is short. */
const SCAN_BLOCKS = 1_000n;

/**
 * One address on the local chain: its balances, whether it is a contract,
 * and the transactions it sent or received in the recent blocks, read block
 * by block from the node since nothing else indexes this chain.
 */
export default async function AddressPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  // Monad has Monadscan; this is for the chain nothing else indexes.
  if (!LOCALNET || !/^0x[0-9a-fA-F]{40}$/.test(raw)) notFound();
  const address = getAddress(raw) as Address;
  const [balance, code, usdc, head] = await Promise.all([
    client.getBalance({ address }),
    client.getCode({ address }),
    USDC ? client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }).catch(() => null) : null,
    client.getBlockNumber(),
  ]);
  const from = head > SCAN_BLOCKS ? head - SCAN_BLOCKS : 0n;
  const blocks = await Promise.all(
    Array.from({ length: Number(head - from + 1n) }, (_, i) => client.getBlock({ blockNumber: head - BigInt(i), includeTransactions: true })),
  );
  const a = address.toLowerCase();
  const txs = blocks.flatMap((b) =>
    b.transactions
      .filter((t) => t.from.toLowerCase() === a || t.to?.toLowerCase() === a)
      .map((t) => ({ t, at: b.timestamp })),
  ).slice(0, 100);
  const k = known(address);

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <p className="label">{appChain.name} · {code && code !== "0x" ? "contract" : "account"}</p>
      <h1 className="mt-2 break-all font-mono text-[15px] text-scribe">{address}{k ? ` · ${k.name}` : ""}</h1>
      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-y border-rule py-4 font-mono text-[13px] max-sm:grid-cols-1">
        <dt className="label">Balance</dt>
        <dd>{formatEther(balance)} {CURRENCY}</dd>
        {usdc !== null ? (<><dt className="label">USDC</dt><dd>{formatUnits(usdc, 6)}</dd></>) : null}
        <dt className="label">Code</dt>
        <dd>{code && code !== "0x" ? `${(code.length - 2) / 2} bytes` : "none"}</dd>
      </dl>
      <p className="label mt-6">Transactions in the last {SCAN_BLOCKS.toString()} blocks ({txs.length})</p>
      <ol className="mt-2 flex flex-col divide-y divide-rule border-y border-rule font-mono text-[12px]">
        {txs.map(({ t, at }) => {
          const c = decodeCall(t.to, t.input);
          return (
            <li key={t.hash} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
              <Link href={`/explorer/tx/${t.hash}`} className="text-probe hover:underline">{t.hash.slice(0, 18)}…</Link>
              <span className="text-scribe-3">{new Date(Number(at) * 1000).toISOString().slice(0, 19).replace("T", " ")}</span>
              <span className="text-scribe-2">{c ? `${c.contract}.${c.fn}` : t.to ? "transfer" : "create"}</span>
              {t.value > 0n ? <span>{formatEther(t.value)} {CURRENCY}</span> : null}
            </li>
          );
        })}
        {txs.length === 0 ? <li className="py-2 text-scribe-3">None.</li> : null}
      </ol>
    </div>
  );
}
