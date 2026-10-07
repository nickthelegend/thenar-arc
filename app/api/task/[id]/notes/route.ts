import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { logged } from "@/lib/server/log";
import { query, run, migrate, count } from "@/lib/server/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_BODY = 500;
/** Per address, per task. Enough for a correction and a second thought. */
const MAX_PER_TASK = 5;

/**
 * What operators found out about a task by driving it.
 *
 * A social feed was the rejected idea, and it deserved rejecting: general
 * commentary has nothing to do with collecting manipulation data. Notes
 * attached to one task are a different object. "The drawer only opens if you
 * approach from the right" is knowledge that makes the next recording better,
 * and it exists nowhere else — the contract cannot hold it and the trajectory
 * cannot express it.
 *
 * There are no accounts here, so authorship is proved rather than claimed:
 * every note carries a signature over its own text, checked here before the
 * row is written and re-checkable by anyone from the response. An address
 * without that is a claim about who wrote something, which is exactly the
 * thing a comment section usually cannot back up.
 */
export function noteMessage(taskId: number, body: string) {
  // The task id is inside the signed text so a note signed for one task cannot
  // be replayed onto another, which an address-and-body-only message allows.
  return `Thenar note\ntask: ${taskId}\n\n${body}`;
}

async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }
  await migrate();
  const notes = await query<{ id: string; author: string; body: string; signature: string; created_at: number }>(
    `SELECT id, author, body, signature, created_at FROM note
      WHERE task_id = ? ORDER BY created_at DESC LIMIT 100`,
    [taskId],
  );
  return NextResponse.json({
    taskId,
    // The signed text is returned with each note so a reader can verify
    // authorship without having to know how the message was composed.
    message: notes.map((n) => noteMessage(taskId, n.body)),
    notes: notes.map((n) => ({ ...n, created_at: Number(n.created_at) })),
  });
}

async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }

  let body: unknown, author: unknown, signature: unknown;
  try {
    ({ body, author, signature } = await req.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "a note needs some text" }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `a note is at most ${MAX_BODY} characters` }, { status: 400 });
  }
  if (typeof author !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(author)) {
    return NextResponse.json({ error: "author must be an address" }, { status: 400 });
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "signature is required" }, { status: 400 });
  }

  const text = body.trim();
  const ok = await verifyMessage({
    address: author as `0x${string}`,
    message: noteMessage(taskId, text),
    signature: signature as `0x${string}`,
  }).catch(() => false);

  if (!ok) {
    // The only thing that makes the byline mean anything.
    return NextResponse.json({ error: "that signature does not match that address" }, { status: 401 });
  }

  await migrate();
  const mine = await count(`SELECT COUNT(*) AS n FROM note WHERE task_id = ? AND author = ?`, [
    taskId, author.toLowerCase(),
  ]);
  if (mine >= MAX_PER_TASK) {
    return NextResponse.json(
      { error: `You have left ${MAX_PER_TASK} notes on this task already.` },
      { status: 429 },
    );
  }

  // Addressed by the signature rather than by a counter: the same note signed
  // twice is the same note, so a double-submit cannot produce two rows.
  const noteId = `n_${signature.slice(2, 34).toLowerCase()}`;
  await run(
    `INSERT INTO note (id, task_id, author, body, signature, created_at)
     VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`,
    [noteId, taskId, author.toLowerCase(), text, signature, Date.now()],
  );

  return NextResponse.json({ id: noteId, taskId, author: author.toLowerCase(), body: text });
}

export const GET = logged("/api/task/[id]/notes", handleGET);
export const POST = logged("/api/task/[id]/notes", handlePOST);
