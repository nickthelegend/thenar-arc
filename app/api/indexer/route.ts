import { NextResponse } from "next/server";
import { LOCALNET, appChain } from "@/lib/chain";
import { logged } from "@/lib/server/log";
import { INDEXER_URL, IndexerError, indexerQuery } from "@/lib/server/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The days a chart shows, newest last. */
const DAYS = 14;

type Stats = {
  runs: number; passkeyRuns: number; operators: number; paidTotal: string;
  sales: number; paidSales: number; salesVolume: string; shareHolders: number; shareSupply: string;
  passkeys: number; subscriptions: number; tasks: number; tasksFilled: number;
  lastBlock: string; lastEventAt: string;
};
type Day = { id: string; dayStart: string; runs: number; paid: string; activeOperators: number; newOperators: number; sales: number };
type Operator = { id: string; runCount: number; passkeyRunCount: number; paidTotal: string; bestScore: number; lastRunAt: string | null };

const QUERY = `query Activity($chain: Int!, $days: Int!) {
  Stats(where: { chainId: { _eq: $chain } }) {
    runs passkeyRuns operators paidTotal sales paidSales salesVolume shareHolders shareSupply
    passkeys subscriptions tasks tasksFilled lastBlock lastEventAt
  }
  DailyStat(where: { chainId: { _eq: $chain } }, order_by: { dayStart: desc }, limit: $days) {
    id dayStart runs paid activeOperators newOperators sales
  }
  Operator(where: { chainId: { _eq: $chain }, runCount: { _gt: 0 } }, order_by: { lastRunAt: desc_nulls_last }, limit: 5) {
    id runCount passkeyRunCount paidTotal bestScore lastRunAt
  }
}`;

/**
 * What the indexer knows about this chain: totals, the last two weeks day by
 * day, and the operators who ran most recently.
 *
 * 503 when no indexer is configured or it cannot be read, so the page says so
 * rather than drawing zeros it never read.
 */
async function handleGET() {
  if (!INDEXER_URL) {
    // A state, not a failure: the page hides the panel, and the browser logs nothing.
    return NextResponse.json({ configured: false, error: "No indexer is configured for this deployment." });
  }
  try {
    const d = await indexerQuery<{ Stats: Stats[]; DailyStat: Day[]; Operator: Operator[] }>(QUERY, { chain: appChain.id, days: DAYS });
    return NextResponse.json(
      { configured: true, chainId: appChain.id, stats: d.Stats[0] ?? null, days: [...d.DailyStat].reverse(), recent: d.Operator },
      { headers: { "cache-control": "public, max-age=10" } },
    );
  } catch (e) {
    const reason = e instanceof IndexerError ? e.message : "the indexer could not be reached";
    return NextResponse.json({ configured: true, local: LOCALNET, error: `The indexer is unavailable: ${reason}.` }, { status: 503 });
  }
}

export const GET = logged("/api/indexer", handleGET);
