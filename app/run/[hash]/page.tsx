import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RunView from "./run-view";

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

export default async function RunPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!HASH.test(hash)) notFound();
  return <RunView />;
}
