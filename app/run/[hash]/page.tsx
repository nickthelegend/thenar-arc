import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import RunView from "./run-view";
import { getTrajectory, trajectoryByTx } from "@/lib/server/db";

/**
 * Say 404 when the run is not there.
 *
 * The view below is a client component: it reads the trajectory in the browser
 * and, if there is nothing, renders a clear "no such run". That is the right
 * thing on screen and the wrong thing on the wire — the server had already
 * answered 200, so every unknown hash was a soft 404. A crawler indexes it, a
 * monitor calls it healthy, and a script checking whether a run exists is told
 * yes. On a site whose whole claim is that the numbers can be checked, the
 * status line is one of the numbers.
 *
 * A hash is 0x and sixty-four hex digits. Anything else cannot name a run that
 * was ever recorded, so it is refused here without asking anyone.
 */
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** The tab names the thing on the page, so a row of open runs and tasks can be told apart. */
export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const { hash } = await params;
  return { title: `Run ${hash.slice(0, 10)}… — Thenar` };
}

/**
 * Whether the store holds this run: true, false, or null when it could not be
 * asked. Behind Vercel the store is the backend's, so it is asked over HTTP;
 * anywhere else the database is this process's own.
 */
async function stored(hash: string): Promise<boolean | null> {
  const backend = process.env.BACKEND_ORIGIN?.replace(/\/$/, "");
  try {
    if (backend) {
      const r = await fetch(`${backend}/api/trajectory/${hash.toLowerCase()}`, { next: { revalidate: 60 } });
      if (r.status === 404) return false;
      return r.ok ? true : null;
    }
    return Boolean(await getTrajectory(hash.toLowerCase()));
  } catch {
    return null;
  }
}

/** The run a settlement transaction paid for, or null. Asked of the backend behind Vercel, as `stored` is. */
async function runForTx(tx: string): Promise<string | null> {
  const backend = process.env.BACKEND_ORIGIN?.replace(/\/$/, "");
  try {
    if (backend) {
      const r = await fetch(`${backend}/api/trajectory/by-tx/${tx.toLowerCase()}`, { next: { revalidate: 60 } });
      return r.ok ? ((await r.json()) as { trajHash: string }).trajHash : null;
    }
    return await trajectoryByTx(tx);
  } catch {
    return null;
  }
}

export default async function RunPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!HASH.test(hash)) notFound();
  // Only a definite "not stored" is a 404. A store that did not answer is not
  // evidence of absence; the view says so in its own words.
  if ((await stored(hash)) === false) {
    // A link may name the run by the transaction that paid for it: send it to the run.
    const run = await runForTx(hash);
    if (run) redirect(`/run/${run}`);
    notFound();
  }
  return <RunView />;
}
