"use client";

import { useReadContract } from "wagmi";
import { LICENCE_RECEIPT_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";

const RECEIPT = DEPLOYED.find((d) => d.key === "licence")!.address;

/**
 * The Warp message attesting this policy, on the licence it attests.
 *
 * This is the most Avalanche-specific thing the project has built and it lived
 * only on the contract registry, which is a list — the place it means something
 * is next to the licence it is about. Warp is validator-signed interchain
 * attestation: the payload below was signed by this subnet's own validators, so
 * another chain can verify the policy existed here without trusting this
 * deployment, or anyone running it.
 *
 * Not every policy is attested. `payloadFor` reverts for one that is not, and
 * that is reported rather than dressed up — a receipt that implies an
 * attestation exists when it does not would be worse than no panel.
 */
export function WarpAttestation({ policyId }: { policyId: number }) {
  const payload = useReadContract({
    address: RECEIPT, abi: LICENCE_RECEIPT_ABI, functionName: "payloadFor",
    args: [BigInt(policyId)],
  });
  const source = useReadContract({
    address: RECEIPT, abi: LICENCE_RECEIPT_ABI, functionName: "sourceChain",
  });

  const bytes = payload.data as `0x${string}` | undefined;
  const attested = typeof bytes === "string" && bytes.length > 2;

  return (
    <div className="mt-4 border-t border-rule pt-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Warp attestation</span>
        <span className={`font-mono text-[12px] ${attested ? "text-signal" : "text-scribe-3"}`}>
          {payload.isLoading ? "reading the receipt…" : attested ? "attested" : "not attested for this policy"}
        </span>
      </div>

      <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        Warp is Avalanche&rsquo;s validator-signed interchain attestation. When a
        policy is attested, this subnet&rsquo;s own validators sign a message
        saying so, and another chain can verify it without trusting this
        deployment or anyone running it.
      </p>

      {attested ? (
        <>
          <p className="mt-3 font-mono text-[12px] text-scribe-3">
            Source chain{" "}
            <span className="text-scribe-2">{String(source.data ?? "—").slice(0, 18)}…</span>
            {" · "}
            {(bytes.length - 2) / 2} bytes
          </p>
          <pre className="mt-2 max-w-full overflow-x-auto border border-rule bg-ink-1 p-3 font-mono text-[11px] leading-relaxed text-scribe-2">
            {bytes.slice(0, 138)}
            {bytes.length > 138 ? "…" : ""}
          </pre>
        </>
      ) : null}
    </div>
  );
}
