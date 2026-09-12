import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { chainClient } from "@/lib/rpc";
import { logged } from "@/lib/server/log";
import { query, run } from "@/lib/server/db";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEAM = 12;
const ROLES = new Set(["funder", "operator", "reviewer", "sponsor"]);

const client = chainClient();

/**
 * Who is working on a task, besides whoever funded it.
 *
 * Team accounts were rejected for having no demand, and for needing an account
 * system this project deliberately does not have. The second half was the real
 * obstacle and it turns out not to be one: a wallet is already an identity
 * here, and a signature is already how this app proves who said something. A
 * team is a roster, and a roster only needs to be attributable.
 *
 * So there are no accounts, no invitations and no logins. The task's funder —
 * read from the chain, not claimed — signs a statement naming an address and a
 * role, and that signature is stored beside the entry. Anyone can check it
 * later without trusting this server, which is the only property that makes a
 * roster worth showing.
 */
export function teamMessage(taskId: number, member: string, role: string) {
  // The task id is inside the signed text so a roster entry signed for one
  // task cannot be replayed onto another, and the role is inside it so a
  // signature naming someone a reviewer cannot be reused to name them funder.
  return `Thenar collaborator\ntask: ${taskId}\nmember: ${member.toLowerCase()}\nrole: ${role}`;
}

async function handleGET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }

  const rows = await query<{ member: string; role: string; signature: string; added_at: number }>(
    `SELECT member, role, signature, added_at FROM collaborator
      WHERE task_id = ? ORDER BY added_at ASC`,
    [taskId],
  );

  return NextResponse.json({
    taskId,
    note: "Each entry is signed by the task's funder over the task, the member and the role. Check it yourself; nothing here needs to be taken on trust.",
    team: rows.map((r) => ({ ...r, added_at: Number(r.added_at) })),
  });
}

async function handlePOST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId < 0) {
    return NextResponse.json({ error: "taskId must be a non-negative integer" }, { status: 400 });
  }

  let member: unknown, role: unknown, signature: unknown;
  try {
    ({ member, role, signature } = await req.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (typeof member !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(member)) {
    return NextResponse.json({ error: "member must be an address" }, { status: 400 });
  }
  if (typeof role !== "string" || !ROLES.has(role)) {
    return NextResponse.json(
      { error: `role must be one of ${[...ROLES].join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "signature is required" }, { status: 400 });
  }

  // Who the funder is, asked of the chain. A roster whose authority came from
  // the request body would be a roster anybody could write.
  const task = (await client.readContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  })) as { funder: string };

  const ok = await verifyMessage({
    address: task.funder as `0x${string}`,
    message: teamMessage(taskId, member, role),
    signature: signature as `0x${string}`,
  }).catch(() => false);

  if (!ok) {
    return NextResponse.json(
      { error: "only the task's funder can name its collaborators, and that signature is not theirs" },
      { status: 401 },
    );
  }

  const existing = await query<{ member: string }>(
    `SELECT member FROM collaborator WHERE task_id = ?`, [taskId],
  );
  if (existing.length >= MAX_TEAM && !existing.some((e) => e.member === member.toLowerCase())) {
    return NextResponse.json({ error: `a task carries at most ${MAX_TEAM} collaborators` }, { status: 409 });
  }

  // Re-signing the same member changes their role rather than erroring: a
  // funder correcting a role should not have to explain themselves.
  await run(
    `INSERT INTO collaborator (task_id, member, role, signature, added_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT (task_id, member) DO UPDATE SET role = ?, signature = ?`,
    [taskId, member.toLowerCase(), role, signature, Date.now(), role, signature],
  );

  return NextResponse.json({ taskId, member: member.toLowerCase(), role });
}

export const GET = logged("/api/task/[id]/team", handleGET);
export const POST = logged("/api/task/[id]/team", handlePOST);
