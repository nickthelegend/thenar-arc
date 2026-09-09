import { NextResponse } from "next/server";
import { PRIOR_CHAINS, PRIOR_CONTRACTS, appChain } from "@/lib/chain";
import { trajectoriesOnChain, trajectoriesOnContract } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs recorded while this deployment settled on an earlier chain. Kept
 *  separate from /api/feed so nothing can render them as current. */
export async function GET() {
  const chains = (
    await Promise.all(
      PRIOR_CHAINS.map(async (c) => ({
        id: c.id, name: c.name, explorer: c.explorer, currency: c.currency,
        runs: await trajectoriesOnChain(c.id),
      })),
    )
  ).filter((c) => c.runs.length > 0);

  // A deployment can be superseded without moving chain. Those runs settled on
  // the chain this app still reads, against a contract that no longer answers
  // for them, so they belong here rather than in the feed.
  const contracts = (
    await Promise.all(
      PRIOR_CONTRACTS
        .filter((c) => c.chainId === appChain.id)
        .map(async (c) => ({
          address: c.address, chainId: c.chainId, label: c.label, why: c.why,
          runs: await trajectoriesOnContract(c.address),
        })),
    )
  ).filter((c) => c.runs.length > 0);

  return NextResponse.json({
    total:
      chains.reduce((n, c) => n + c.runs.length, 0) +
      contracts.reduce((n, c) => n + c.runs.length, 0),
    chains,
    contracts,
  });
}
