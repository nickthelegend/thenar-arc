import { canonicalise } from "@/lib/canonical";
import { keccak256, toHex } from "viem";

/** A fixed sample run through this build's canonicaliser. Two services that
 *  agree on this agree on every hash they will ever produce. */
export function canonicalShape(): string {
  const probe = [{
    t: 0, q: [0, 0, 0, 0, 0, 0], grip: 42,
    object: [0, 0, 0], object2: [0, 0, 0],
    q2: [0, 0, 0, 0, 0, 0], grip2: 42,
  }] as unknown as Parameters<typeof canonicalise>[2];
  return keccak256(toHex(canonicalise(0, "0x0000000000000000000000000000000000000000", probe, ["a"])));
}
