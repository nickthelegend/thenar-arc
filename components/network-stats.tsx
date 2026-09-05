"use client";

import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, addressUrl } from "@/lib/chain";
import { useTasks } from "@/lib/hooks";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";

/** What the contract actually holds right now. Nothing here is a fixture. */
export function NetworkStats() {
  const { data: tasks } = useTasks();
  const { data } = useReadContracts({
    contracts: [
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" },
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount" },
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyCount" },
    ],
    query: { enabled: IS_DEPLOYED, refetchInterval: 6_000 },
  });

  const n = (i: number) => Number((data?.[i]?.result as bigint | undefined) ?? 0n);
  const escrow = (tasks ?? []).reduce((a, t) => a + Number(formatEther(t.escrowWei)), 0);
  const openSlots = (tasks ?? []).reduce((a, t) => a + (t.slotsTotal - t.slotsFilled), 0);

  if (!IS_DEPLOYED) return null;

  return (
    <div className="flex flex-col gap-3 border-y border-rule py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Reading label="Tasks" value={fmtInt(n(0))} />
        <Reading label="Trajectories recorded" value={fmtInt(n(1))} />
        <Reading label="Policies minted" value={fmtInt(n(2))} />
        <Reading label="Open slots" value={fmtInt(openSlots)} />
        <Reading label="Escrowed" value={fmtMon(escrow, 3)} unit="MON" tone="signal" />
      </div>
      <a
        href={addressUrl(AXON_ADDRESS)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[12px] text-scribe-3 transition-colors hover:text-probe"
      >
        AxonProtocol · {shortHash(AXON_ADDRESS)} · verified on Monad Testnet →
      </a>
    </div>
  );
}

function Reading({
  label, value, unit, tone,
}: { label: string; value: string; unit?: string; tone?: "signal" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span
        className={`font-mono text-[16px] font-medium tabular-nums ${
          tone === "signal" ? "text-signal" : "text-scribe"
        }`}
      >
        {value}
        {unit ? <span className="ml-1 text-[12px] text-scribe-3">{unit}</span> : null}
      </span>
    </span>
  );
}
