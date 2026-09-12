import { notFound } from "next/navigation";

import { chainClient } from "@/lib/rpc";

import { AXON_ADDRESS } from "@/lib/chain";
import TaskView from "./task-view";

/**
 * Say 404 when the task is not there.
 *
 * Same argument as the run page: the view is a client component that reads the
 * registry in the browser and renders "no such task" perfectly well, while the
 * server had already answered 200. A soft 404 tells a crawler the page is real
 * and tells a script that task #999 exists.
 *
 * Unlike a run hash, "999" cannot be judged by its shape — the registry is the
 * only thing that knows how many tasks there are. So this asks the contract,
 * and the interesting part is what it does when the contract does not answer:
 * it renders the page. Refusing to serve a task because an RPC endpoint was
 * briefly unreachable would turn a slow network into a site full of 404s,
 * which is a worse failure than the one being fixed. Certain absence is a 404;
 * an unanswered question is not.
 */
const client = chainClient();

/** The count moves only when somebody funds a task. A minute of staleness is
 *  cheaper than an RPC round trip on every task page view. */
export const revalidate = 60;

async function taskCount(): Promise<number | null> {
  try {
    const n = await client.readContract({
      address: AXON_ADDRESS,
      abi: [{
        type: "function", name: "taskCount", inputs: [],
        outputs: [{ type: "uint256" }], stateMutability: "view",
      }],
      functionName: "taskCount",
    });
    return Number(n);
  } catch {
    return null;
  }
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A task id is a non-negative integer. "abc" and "1.5" name nothing, and
  // that much needs no network.
  if (!/^\d+$/.test(id)) notFound();

  const count = await taskCount();
  if (count !== null && Number(id) >= count) notFound();

  return <TaskView />;
}
