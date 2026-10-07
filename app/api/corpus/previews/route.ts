import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { samplesFor } from "@/lib/server/db";
import { previewOf, type Preview } from "@/lib/corpus-preview";
import type { Sample } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The most episodes one request previews: a page of the corpus. */
const MAX = 60;
const HASH = /^0x[0-9a-f]{64}$/;

/**
 * Previews for a page of episodes, in one request.
 *
 *   GET /api/corpus/previews?hashes=0xabc…,0xdef…
 *
 * The corpus page lists up to a few hundred episodes, and fetching each run's
 * samples to draw it would be a request per card. This answers for a page at
 * once, from one query, with each run thinned to a fixed number of points
 * (lib/corpus-preview.ts). A hash names its samples for good, so a complete
 * answer never changes and is cached as immutable.
 */
async function handleGET(req: Request) {
  const raw = new URL(req.url).searchParams.get("hashes") ?? "";
  const hashes = [...new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean))];
  if (!hashes.length) return NextResponse.json({ error: "hashes is a comma-separated list of run hashes" }, { status: 400 });
  if (hashes.length > MAX) return NextResponse.json({ error: `at most ${MAX} hashes a request` }, { status: 400 });
  const bad = hashes.find((h) => !HASH.test(h));
  if (bad) return NextResponse.json({ error: `${bad.slice(0, 80)} is not a run hash (0x and 64 hex digits)` }, { status: 400 });

  const rows = await samplesFor(hashes);
  const previews: Record<string, Preview> = {};
  for (const r of rows) {
    try {
      const p = previewOf(JSON.parse(r.samples) as Sample[]);
      if (p) previews[r.traj_hash] = p;
    } catch {
      // A row whose samples do not parse has no preview; the card says so.
    }
  }
  const missing = hashes.filter((h) => !previews[h]);
  // Immutable only when complete: a hash missing now may be stored a moment later.
  return NextResponse.json(
    { previews, missing },
    { headers: { "cache-control": missing.length ? "no-store" : "public, max-age=31536000, immutable" } },
  );
}

export const GET = logged("/api/corpus/previews", handleGET);
