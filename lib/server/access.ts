import "server-only";
import { getAddress } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED } from "@/lib/chain";
import { arc } from "@/lib/server/arc";

/**
 * Whether an address may pull a task's whole corpus from /api/dataset: it
 * holds an on-chain licence to the task's policy (`ThenarProtocol.licensed`),
 * bought on Arc with `licensePolicy` or from Base / Ethereum over CCIP.
 *
 * Asked of the chain every time, never cached. A task with no policy minted
 * has no licence to hold, so its corpus is sold per pull over x402 instead
 * (/api/agent/corpus). An unreadable chain keeps the gate shut and says so.
 */
export type Access =
  | { gated: false; reason: string }
  | { gated: true; allowed: boolean; who: string | null; policyId: string | null; unreadable?: true };

export async function corpusLicence(taskId: number, who: string | null): Promise<Access> {
  if (!IS_DEPLOYED) return { gated: false, reason: "ThenarProtocol is not deployed on this network" };
  const holder = who && /^0x[0-9a-fA-F]{40}$/.test(who) ? getAddress(who) : null;
  try {
    const [minted, policyId] = await arc.readContract({
      address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyOfTask", args: [BigInt(taskId)],
    }) as readonly [boolean, bigint];
    if (!minted) return { gated: true, allowed: false, who: holder?.toLowerCase() ?? null, policyId: null };
    if (!holder) return { gated: true, allowed: false, who: null, policyId: policyId.toString() };
    const ok = await arc.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "licensed", args: [policyId, holder] });
    return { gated: true, allowed: Boolean(ok), who: holder.toLowerCase(), policyId: policyId.toString() };
  } catch {
    return { gated: true, allowed: false, who: holder?.toLowerCase() ?? null, policyId: null, unreadable: true };
  }
}
