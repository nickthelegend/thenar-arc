import "server-only";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";
import { armOf, type ArmKind } from "@/lib/scan";

/**
 * Which arm a task is for, read from its name on chain. A task's name never
 * changes, so an answer is kept for the life of the process.
 */
const known = new Map<number, ArmKind>();

export async function armForTask(taskId: number): Promise<ArmKind> {
  const hit = known.get(taskId);
  if (hit) return hit;
  const task = (await chainClient().readContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  })) as { name: string };
  const arm = armOf(task.name);
  known.set(taskId, arm);
  return arm;
}
