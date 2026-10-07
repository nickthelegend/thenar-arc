import { NextResponse } from "next/server";
import { query, migrate } from "@/lib/server/sql";
import { appChain } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Two weeks is enough to see a shape and short enough that the counter never
 *  becomes a history of anything. */
const DAYS = 14;

/**
 * What the protocol did, and what people opened, in aggregate.
 *
 * Both halves are counts with no subject. The run figures come from the same
 * ledger every other page reads; the page figures come from a table that holds
 * a path, a date and an integer. Neither can be narrowed to a person, which is
 * the property that makes publishing them at all defensible.
 */
export async function GET() {
  await migrate();
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);

  const views = await query<{ path: string; n: number | string }>(
    `SELECT path, SUM(n) AS n FROM pageview WHERE day >= ?
     GROUP BY path ORDER BY SUM(n) DESC`,
    [since],
  );

  const viewsByDay = await query<{ day: string; n: number | string }>(
    `SELECT day, SUM(n) AS n FROM pageview WHERE day >= ? GROUP BY day ORDER BY day ASC`,
    [since],
  );

  // Runs are stamped in milliseconds, and grouping them by day has to happen
  // in a way both engines agree on — so the bucketing is done here rather than
  // in SQL, where the date functions differ.
  const runs = await query<{ created_at: number; score: number; contributor: string }>(
    `SELECT created_at, score, contributor FROM trajectory
      WHERE settled = 1 AND chain_id = ? ORDER BY created_at ASC`,
    [appChain.id],
  );

  const runsByDay = new Map<string, number>();
  for (const r of runs) {
    const day = new Date(Number(r.created_at)).toISOString().slice(0, 10);
    runsByDay.set(day, (runsByDay.get(day) ?? 0) + 1);
  }

  return NextResponse.json({
    since,
    days: DAYS,
    // Named so nobody has to guess whether "views" means people.
    note: "Counts only. No identifiers are stored, and requests signalling DNT or GPC are not counted at all.",
    views: views.map((v) => ({ path: v.path, n: Number(v.n) })),
    viewsByDay: viewsByDay.map((v) => ({ day: v.day, n: Number(v.n) })),
    runs: {
      total: runs.length,
      operators: new Set(runs.map((r) => r.contributor.toLowerCase())).size,
      meanScore: runs.length
        ? Math.round(runs.reduce((n, r) => n + Number(r.score), 0) / runs.length)
        : 0,
      byDay: [...runsByDay.entries()].map(([day, n]) => ({ day, n })),
    },
  });
}
