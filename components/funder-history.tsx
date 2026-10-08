"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { DimRule } from "@/components/primitives";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, AXON_DEPLOY_BLOCK, CURRENCY, IS_DEPLOYED, txUrl } from "@/lib/chain";
import { scanLogs } from "@/lib/scan-logs";
import { shortHash } from "@/lib/format";
import { formatUsdc } from "@/lib/usdc";

type Entry = { tx: `0x${string}`; block: bigint; index: number; what: string; who: string | null; amount: bigint | null };

const EVENTS = ["TaskCreated", "TaskFunded", "TaskFilled", "TaskExpired", "PolicyMinted"] as const;

/**
 * What happened to this task's money, read off the protocol's own events.
 *
 * The contract says what a task is now; its events say how it got there: who
 * created it, who topped it up and by how much, when it filled, whether its
 * funder closed it and took the rest back, and when its policy was minted.
 * Every entry is a log ThenarProtocol emitted for this task id, so the list is
 * exactly this task's and needs no index: it reads the same on Arc and on a
 * local fork. Each row links to the transaction, final when it was included.
 */
export function FunderHistory({ taskId, funder }: { taskId: number; funder: string }) {
  const client = usePublicClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["task-lifecycle", taskId],
    enabled: Boolean(client) && IS_DEPLOYED,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Entry[]> => {
      const toBlock = await client!.getBlockNumber();
      const out: Entry[] = [];
      for (const eventName of EVENTS) {
        const logs = await scanLogs(
          (r) =>
            client!.getContractEvents({
              address: AXON_ADDRESS, abi: AXON_ABI, eventName,
              args: { taskId: BigInt(taskId) } as never,
              fromBlock: r.fromBlock, toBlock: r.toBlock,
            }),
          { fromBlock: AXON_DEPLOY_BLOCK, toBlock },
        );
        for (const l of logs) {
          const a = (l as unknown as { args: Record<string, unknown> }).args;
          out.push({
            tx: l.transactionHash as `0x${string}`,
            block: l.blockNumber ?? 0n,
            index: l.logIndex ?? 0,
            what:
              eventName === "TaskCreated" ? "Posted"
              : eventName === "TaskFunded" ? "Escrow in"
              : eventName === "TaskFilled" ? "Every slot filled"
              : eventName === "TaskExpired" ? "Closed, unspent escrow returned"
              : `Policy #${String(a.policyId)} minted`,
            who: (a.funder ?? a.from ?? null) as string | null,
            amount:
              eventName === "TaskFunded" ? (a.amount as bigint)
              : eventName === "TaskExpired" ? (a.refunded as bigint)
              : eventName === "PolicyMinted" ? (a.licenceFee as bigint)
              : null,
          });
        }
      }
      return out.sort((x, y) => (x.block === y.block ? x.index - y.index : x.block < y.block ? -1 : 1));
    },
  });

  return (
    <>
      <DimRule className="mt-10" note="Escrow history" />
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        Every event the protocol emitted for task #{taskId}: the post, each top-up and who made it, the fill, a close,
        a policy. Read from the chain itself, so it is complete for this task.
      </p>
      {error ? (
        <p className="mt-3 text-[14px] text-scribe-3">
          The chain did not return this task&rsquo;s events just now. Everything above is read from the contract
          directly and is unaffected.
        </p>
      ) : isLoading || !data ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="hatch h-8" />)}
        </ul>
      ) : data.length === 0 ? (
        <p className="mt-3 text-[14px] text-scribe-3">No events for this task in this deployment.</p>
      ) : (
        <ol className="mt-3">
          {data.map((c) => (
            <li
              key={`${c.tx}-${c.index}`}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-rule py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))]"
            >
              <span className="truncate text-[13px] text-scribe">{c.what}</span>
              <span className="hidden font-mono text-[12px] text-scribe-3 sm:block">
                {c.who ? (c.who.toLowerCase() === funder.toLowerCase() ? "funder" : shortHash(c.who)) : ""}
              </span>
              <span className="hidden text-right font-mono text-[12px] tabular-nums text-signal sm:block">
                {c.amount !== null ? `${formatUsdc(c.amount)} ${CURRENCY}` : ""}
              </span>
              <a href={txUrl(c.tx)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-scribe-3 hover:text-probe">
                {c.tx.slice(0, 10)}&hellip; &rarr;
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
