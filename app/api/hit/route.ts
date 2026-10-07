import { NextResponse } from "next/server";
import { run, migrate } from "@/lib/server/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Count that a page was opened. Nothing else.
 *
 * Analytics was on the rejected list for its privacy cost, and that cost is
 * real — but it is a cost of the usual implementation, not of counting. What
 * makes ordinary analytics expensive is the identifier: a cookie, a
 * fingerprint, an address, anything that turns a count into a trail. There is
 * none here. The request body carries a path; the row it lands in has a path,
 * a date and an integer, and the schema has nowhere to put anything else.
 *
 * The caller's address is never read, so this cannot be rate-limited per
 * visitor. It is bounded the other way instead: only paths this app actually
 * has are counted, so the table cannot be filled with invented ones, and the
 * worst an abusive caller can do is inflate a number they could already read.
 */
const KNOWN = new Set<string>([
  "/", "/hub", "/space", "/inventory", "/portfolio", "/leaderboard", "/foundry",
  "/status", "/changelog", "/archive", "/passkey", "/spec", "/spec/so101", "/post",
  "/station", "/task", "/run", "/operator", "/licence",
]);

export async function POST(req: Request) {
  // Do Not Track and Global Privacy Control both mean the same thing here, and
  // honouring only the one that is fashionable would be honouring neither.
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") {
    return NextResponse.json({ counted: false, reason: "signalled" });
  }

  let path: unknown;
  try {
    ({ path } = await req.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  // Far above any route this app has, and only here so a caller cannot hand
  // the splitter a megabyte. It is not the bound that protects the table —
  // that is the known-path check below.
  if (path.length > 512) {
    return NextResponse.json({ error: "path is too long" }, { status: 400 });
  }

  // Dynamic routes collapse to their section. /run/0xabc… is a hash, and a
  // table of hashes-by-day is a trail of what one person looked at even
  // without a name attached to it.
  //
  // The collapse happens before any length check, and that ordering is the
  // whole point. It used to run after a 64-character limit, which meant every
  // /run/0x… view — 71 characters, because a hash is 66 of them — was refused
  // with "path is required" and never counted. The page most worth counting
  // was the one page that could not be. Only the section is read from here on,
  // so length stopped being a way to put anything unexpected in the table the
  // moment the collapse moved above it.
  const section = "/" + (path.split("/")[1] ?? "");
  const key = KNOWN.has(path) ? path : KNOWN.has(section) ? section : null;
  if (!key) return NextResponse.json({ counted: false, reason: "unknown path" });

  const day = new Date().toISOString().slice(0, 10);
  await migrate();
  await run(
    `INSERT INTO pageview (path, day, n) VALUES (?,?,1)
     ON CONFLICT (path, day) DO UPDATE SET n = pageview.n + 1`,
    [key, day],
  );

  return NextResponse.json({ counted: true });
}
