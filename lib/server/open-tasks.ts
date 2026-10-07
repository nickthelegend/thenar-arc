import "server-only";
import { formatEther } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";
import { armOf, instructionOf } from "@/lib/scan";

export type OpenTask = {
  id: number;
  instruction: string;
  arm: "so101" | "thenar6";
  rewardMon: number;
  slotsLeft: number;
  slotsTotal: number;
  escrowMon: number;
  /** Takes runs now: slots left, not closed, no policy minted, not past its deadline. */
  accepting: boolean;
};

/**
 * Every task on the protocol as the chain has it, and the totals across them.
 *
 * "Open" means what the hub means by it: a task that would take a run now.
 * Counting every unfilled slot also counted tasks that were closed or past
 * their deadline, and the home page said 39 runs were open while the hub,
 * reading the same contract, said 24.
 */
export async function openTasks(): Promise<{ tasks: OpenTask[]; escrowMon: number; slotsLeft: number } | null> {
  if (!IS_DEPLOYED) return null;
  try {
    const client = chainClient();
    const count = Number(await client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" }));
    const raw = (await Promise.all(
      Array.from({ length: count }, (_, i) =>
        client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTask", args: [BigInt(i)] }),
      ),
    )) as unknown as {
      name: string; rewardPerTrajectory: bigint; escrow: bigint; slotsTotal: number; slotsFilled: number;
      policyMinted: boolean; closed: boolean; expiresAt: bigint;
    }[];
    const now = Date.now();
    const tasks = raw.map((t, id) => {
      const slotsLeft = Math.max(0, Number(t.slotsTotal) - Number(t.slotsFilled));
      const expired = Number(t.expiresAt) > 0 && now >= Number(t.expiresAt) * 1000;
      return {
        id,
        instruction: instructionOf(t.name),
        arm: armOf(t.name),
        rewardMon: Number(formatEther(t.rewardPerTrajectory)),
        slotsLeft,
        slotsTotal: Number(t.slotsTotal),
        escrowMon: Number(formatEther(t.escrow)),
        accepting: slotsLeft > 0 && !t.policyMinted && !t.closed && !expired,
      };
    });
    return {
      tasks,
      escrowMon: tasks.reduce((n, t) => n + t.escrowMon, 0),
      slotsLeft: tasks.filter((t) => t.accepting).reduce((n, t) => n + t.slotsLeft, 0),
    };
  } catch {
    return null;
  }
}
