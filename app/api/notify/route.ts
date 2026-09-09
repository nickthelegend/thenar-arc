import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { query, run, count } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tell someone when something they asked about happens.
 *
 * Email notifications were rejected because there are no accounts and no
 * addresses, and that is still true — there is nobody to email and no mail
 * service to email them with. The value behind the idea does not depend on
 * email, though: what an operator wants is to be told when a task they care
 * about fills, or when a policy they contributed to is licensed.
 *
 * Web push does that with nothing this project has to be trusted with. The
 * subscription is issued by the reader's own browser, the keys are ours and
 * were generated locally, and there is no third party in the path. What is
 * stored is an endpoint, two keys the browser gave us to encrypt to it, and a
 * topic — no address, no name, nothing that identifies a person rather than a
 * subscription they can revoke from the browser itself.
 */
const TOPICS = new Set(["task-filled", "policy-minted", "licence-sold"]);

/** Enough that a bad actor cannot fill the table, small enough that nobody
 *  legitimate notices. */
const MAX_SUBSCRIPTIONS = 5_000;

async function handlePOST(req: Request) {
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; topic?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const { endpoint, keys, topic } = body;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 512) {
    return NextResponse.json({ error: "endpoint must be an https push endpoint" }, { status: 400 });
  }
  if (typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return NextResponse.json({ error: "the browser's encryption keys are required" }, { status: 400 });
  }
  if (typeof topic !== "string" || !TOPICS.has(topic)) {
    return NextResponse.json(
      { error: `topic must be one of ${[...TOPICS].join(", ")}` },
      { status: 400 },
    );
  }

  if (await count("SELECT COUNT(*) AS n FROM pushsub") >= MAX_SUBSCRIPTIONS) {
    return NextResponse.json({ error: "not taking new subscriptions right now" }, { status: 503 });
  }

  // Keyed on the endpoint, which is what the browser reissues when a
  // subscription changes — so resubscribing updates rather than duplicates.
  await run(
    `INSERT INTO pushsub (endpoint, p256dh, auth, topic, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = ?, auth = ?, topic = ?`,
    [endpoint, keys.p256dh, keys.auth, topic, Date.now(), keys.p256dh, keys.auth, topic],
  );

  return NextResponse.json({ subscribed: true, topic });
}

async function handleDELETE(req: Request) {
  let endpoint: unknown;
  try {
    ({ endpoint } = await req.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }
  // No proof required: the endpoint is the secret. Anyone who has it already
  // holds the ability to receive the notices, so being able to stop them is
  // strictly less power than they already had.
  await run("DELETE FROM pushsub WHERE endpoint = ?", [endpoint]);
  return NextResponse.json({ unsubscribed: true });
}

async function handleGET() {
  const rows = await query<{ topic: string; n: number | string }>(
    "SELECT topic, COUNT(*) AS n FROM pushsub GROUP BY topic",
  );
  return NextResponse.json({
    // Counts only. What is stored per subscription is an endpoint and two
    // encryption keys, and none of it is returned here or anywhere else.
    topics: [...TOPICS],
    subscriptions: rows.map((r) => ({ topic: r.topic, n: Number(r.n) })),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export const POST = logged("/api/notify", handlePOST);
export const DELETE = logged("/api/notify", handleDELETE);
export const GET = logged("/api/notify", handleGET);
