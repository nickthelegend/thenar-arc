import { NextResponse } from "next/server";
import { verifyMessage, isAddress } from "viem";
import { logged } from "@/lib/server/log";
import { annotationFor, upsertAnnotation, getTrajectory } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 400;

/**
 * What the operator says happened on this run.
 *
 * The task instruction says what was asked. The samples say where the arm
 * went. Neither says the operator came in too flat and had to re-seat it —
 * and that sentence is the sort of thing a text-conditioned policy trains on,
 * and it exists nowhere else in the record.
 *
 * Only the address that recorded the run may annotate it. Not out of
 * territoriality: an annotation is a first-person account, and a sentence
 * about what somebody else meant to do is a guess wearing the same clothes.
 *
 * Signed over the run's own hash, so the byline is proved rather than typed,
 * and re-checkable by anyone from what this route returns.
 */
function message(hash: string, body: string) {
  return `Thenar annotation\nrun: ${hash}\n\n${body}`;
}

async function handleGET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ error: "hash must be 32 bytes" }, { status: 400 });
  }
  const a = await annotationFor(hash);
  return NextResponse.json({
    trajHash: hash,
    annotation: a
      ? { author: a.author, body: a.body, signature: a.signature, createdAt: a.created_at }
      : null,
  });
}

async function handlePOST(req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ error: "hash must be 32 bytes" }, { status: 400 });
  }

  let body: { body?: unknown; author?: unknown; signature?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "body must be JSON" }, { status: 400 }); }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  const author = typeof body.author === "string" ? body.author : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  if (!text || text.length > MAX_BODY) {
    return NextResponse.json({ error: `an annotation is 1 to ${MAX_BODY} characters` }, { status: 400 });
  }
  if (!isAddress(author)) {
    return NextResponse.json({ error: "author must be an address" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "signature is required" }, { status: 400 });
  }

  const run = await getTrajectory(hash);
  if (!run) return NextResponse.json({ error: "no trajectory with that hash" }, { status: 404 });

  // First-person only. An annotation by anyone else is a guess about what
  // somebody meant to do, which is worth less than nothing in training data.
  if (run.contributor.toLowerCase() !== author.toLowerCase()) {
    return NextResponse.json(
      { error: "only the address that recorded this run can annotate it" },
      { status: 403 },
    );
  }

  const ok = await verifyMessage({
    address: author as `0x${string}`,
    message: message(hash, text),
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!ok) {
    return NextResponse.json({ error: "that signature does not match the annotation" }, { status: 401 });
  }

  await upsertAnnotation({
    traj_hash: hash, author, body: text, signature, created_at: Date.now(),
  });

  return NextResponse.json({ trajHash: hash, annotation: { author, body: text, signature } });
}

export const GET = logged("/api/trajectory/[hash]/annotation", handleGET);
export const POST = logged("/api/trajectory/[hash]/annotation", handlePOST);
