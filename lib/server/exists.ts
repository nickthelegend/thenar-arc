import "server-only";
import { AXON_ADDRESS, IS_DEPLOYED } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { chainClient } from "@/lib/rpc";

/**
 * How many tasks and policies the contract holds, for pages that must answer
 * 404 when theirs is not one of them.
 *
 * Null when the chain does not answer. The same rule as the task page: certain
 * absence is a 404, an unanswered question is not — refusing to serve a page
 * because an endpoint was briefly unreachable turns a slow network into a site
 * full of 404s.
 */
const client = chainClient();

async function count(functionName: "taskCount" | "policyCount"): Promise<number | null> {
  if (!IS_DEPLOYED) return null;
  try {
    return Number(await client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName }));
  } catch {
    return null;
  }
}

export const taskCount = () => count("taskCount");
export const policyCount = () => count("policyCount");

/** True only when the chain answered and the id is not below the count. */
export async function certainlyAbsent(id: string, which: "task" | "policy"): Promise<boolean> {
  if (!/^(0|[1-9]\d*)$/.test(id)) return true; // no leading zeros: one URL per id
  const n = which === "task" ? await taskCount() : await policyCount();
  return n !== null && Number(id) >= n;
}
