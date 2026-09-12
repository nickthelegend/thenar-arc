import "server-only";
import { parseAbi } from "viem";
import { chainClient } from "../rpc";
import { CORPUS_ACCESS } from "@/lib/chain";

/**
 * Whether an address may pull the corpus right now.
 *
 * Asked of the chain, every time, rather than cached: a subscription is a
 * timestamp and the only interesting moment in its life is when it stops being
 * true. A cache here would sell an extra hour to everyone whose access had
 * just lapsed, which is a small dishonesty that compounds.
 *
 * Absent configuration, everything is open. That is deliberate rather than a
 * failure mode: this corpus has always been downloadable and turning it off by
 * accident — because an environment variable went missing — would be worse
 * than the subscription not being enforced.
 */
const abi = parseAbi([
  "function active(address who) view returns (bool)",
  "function remaining(address who) view returns (uint64)",
  "function pricePerDay() view returns (uint256)",
]);

const client = chainClient();

export type Access =
  | { gated: false; reason: string }
  | { gated: true; allowed: boolean; who: string | null; remainingSeconds: number };

export async function corpusAccess(who: string | null): Promise<Access> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CORPUS_ACCESS)) {
    return { gated: false, reason: "no subscription contract is configured" };
  }
  if (!who || !/^0x[0-9a-fA-F]{40}$/.test(who)) {
    return { gated: true, allowed: false, who: null, remainingSeconds: 0 };
  }
  try {
    const [ok, left] = await Promise.all([
      client.readContract({ address: CORPUS_ACCESS, abi, functionName: "active", args: [who as `0x${string}`] }),
      client.readContract({ address: CORPUS_ACCESS, abi, functionName: "remaining", args: [who as `0x${string}`] }),
    ]);
    return { gated: true, allowed: Boolean(ok), who: who.toLowerCase(), remainingSeconds: Number(left) };
  } catch {
    // The chain is unreachable. Refusing every download because a node is
    // having a bad minute would punish subscribers for our problem.
    return { gated: false, reason: "the subscription contract could not be read" };
  }
}
