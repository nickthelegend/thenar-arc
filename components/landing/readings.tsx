"use client";

import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED, addressUrl, CURRENCY, appChain } from "@/lib/chain";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";
import { useTaskCatalogue } from "@/components/tasks-provider";

/**
 * What the contract holds right now, on the landing page.
 *
 * The redesign that made this page a poster dropped the live readings along
 * with the rest of the old layout, and left a page whose central claim is that
 * the economy settles on chain, carrying no evidence that anything is on chain
 * at all. Every other figure here comes from lib/arm-spec.json — real, but
 * static, and true of a machine rather than of a protocol with money in it.
 *
 * So the numbers come back, in the poster's own voice rather than the app's: a
 * hairline-ruled row of monospaced readings, which is the metadata layer this
 * design already uses as counterweight, doing the one job on this page that
 * only live data can do. Nothing here is a fixture, and the contract address
 * is printed beside them so the claim is checkable rather than asserted.
 */
export function LiveReadings() {
  const { tasks } = useTaskCatalogue();
  const { data } = useReadContracts({
    contracts: [
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" },
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount" },
      { address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyCount" },
    ],
    query: { enabled: IS_DEPLOYED, refetchInterval: 6_000 },
  });

  if (!IS_DEPLOYED) return null;

  const n = (i: number) => Number((data?.[i]?.result as bigint | undefined) ?? 0n);
  const all = tasks ?? [];
  const escrow = all.reduce((a, t) => a + Number(formatEther(t.escrowWei)), 0);
  const openSlots = all.reduce((a, t) => a + (t.slotsTotal - t.slotsFilled), 0);

  const rows: [string, string, string?][] = [
    ["Tasks", fmtInt(n(0))],
    ["Trajectories", fmtInt(n(1))],
    ["Policies", fmtInt(n(2))],
    ["Open slots", fmtInt(openSlots)],
    ["Escrowed", fmtMon(escrow, 3), CURRENCY],
  ];

  return (
    <div className="on-stage">
      <div className="wrap" style={{ borderTop: "1px solid var(--hair)", paddingBlock: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "14px 44px" }}>
          {rows.map(([label, value, unit]) => (
            <span key={label} style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span className="meta meta-sm muted">{label}</span>
              <span className="meta num" style={{ fontSize: 15, letterSpacing: "0.02em" }}>
                {value}
                {unit ? <span className="muted">&nbsp;{unit}</span> : null}
              </span>
            </span>
          ))}
          <a
            href={addressUrl(AXON_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="meta meta-sm accent"
            style={{ marginLeft: "auto" }}
          >
            {shortHash(AXON_ADDRESS)} on {appChain.name} &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
