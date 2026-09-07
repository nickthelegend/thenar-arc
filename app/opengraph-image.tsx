import { ImageResponse } from "next/og";
import { createPublicClient, http } from "viem";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";

export const alt = "Thenar — the data foundry for physical AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a link to this project unfurls into.
 *
 * It carries the live counts rather than a static boast, because the whole
 * claim is that the numbers are real and checkable — a share card quoting
 * figures nobody can verify would be the one place the product lied. If the
 * chain cannot be reached the card renders without them rather than with
 * invented ones.
 */
export default async function Image() {
  let counts: { tasks: number; runs: number; policies: number } | null = null;

  if (IS_DEPLOYED) {
    try {
      const client = createPublicClient({ chain: appChain, transport: http() });
      const [tasks, runs, policies] = await Promise.all([
        client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" }),
        client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount" }),
        client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyCount" }),
      ]);
      counts = { tasks: Number(tasks), runs: Number(runs), policies: Number(policies) };
    } catch {
      counts = null;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#080808", color: "#FFFFFF", padding: "64px 72px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 14, height: 14, background: "#FF6A00" }} />
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#8F8F8F" }}>THENAR</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>
            Physical AI is short of data,
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, color: "#8F8F8F" }}>
            not compute.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 56 }}>
            {counts
              ? ([
                  ["TASKS", counts.tasks],
                  ["RUNS PAID", counts.runs],
                  ["POLICIES", counts.policies],
                ] as const).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 15, letterSpacing: 3, color: "#8F8F8F" }}>{l}</div>
                    <div style={{ fontSize: 40, color: "#FF6A00" }}>{v}</div>
                  </div>
                ))
              : (
                <div style={{ fontSize: 20, color: "#8F8F8F" }}>
                  Teleoperate a robot arm in the browser. Get paid per run.
                </div>
              )}
          </div>
          <div style={{ fontSize: 18, color: "#8F8F8F" }}>{appChain.name}</div>
        </div>
      </div>
    ),
    size,
  );
}
