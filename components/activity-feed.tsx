"use client";

import { useActivity } from "@/lib/hooks";
import { txUrl } from "@/lib/chain";
import { fmtMon, fmtScore, shortHash } from "@/lib/format";
import { DimRule } from "./primitives";

/** Every accepted run on the network, read from TrajectoryAccepted logs. */
export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const { data, isLoading, isError } = useActivity(limit);

  return (
    <section>
      <DimRule note="Network activity" />
      {isError ? (
        <p className="mt-4 text-[14px] text-scribe-3">
          Could not read the trajectory ledger. The chain itself is unaffected.
        </p>
      ) : isLoading ? (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <li key={i} className="hatch h-4" />)}
        </ul>
      ) : (data?.length ?? 0) === 0 ? (
        <p className="mt-4 max-w-[58ch] text-[14px] text-scribe-3">
          No runs recorded yet. The first accepted trajectory on this contract
          will appear here, with the transaction that paid for it.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col">
          {data!.map((e) => (
            <li
              key={e.trajectoryId}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2 font-mono text-[12px]"
            >
              <span className="text-scribe-3">#{e.trajectoryId}</span>
              <span className="text-scribe-2">{shortHash(e.contributor)}</span>
              <span className="text-scribe-3">task {e.taskId}</span>
              <span className="text-scribe">{fmtScore(e.score)}</span>
              <span className="text-signal tabular-nums">{fmtMon(e.paidMon)} MON</span>
              {e.txHash ? (
                <a
                  href={txUrl(e.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-probe hover:underline"
                >
                  {shortHash(e.txHash)}
                </a>
              ) : (
                <a href={`/run/${e.trajHash}`} className="ml-auto text-probe hover:underline">
                  verify →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
