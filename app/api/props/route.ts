import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/server/rate-limit";
import { createHash } from "node:crypto";
import { insertProp, listProps, propBySha } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;
const GLTF_MAGIC = 0x46546c67; // "glTF"

/**
 * Accept a funder's own model — after checking it is one.
 *
 * The file is parsed as a glTF 2.0 binary rather than trusted by extension: a
 * corrupt upload would not fail here, it would fail silently inside the station
 * on somebody else's run, against a task that had already escrowed money.
 */
function readGlb(buf: Buffer): { meshes: number; triangles: number } {
  if (buf.length < 20) throw new Error("too short to be a GLB");
  if (buf.readUInt32LE(0) !== GLTF_MAGIC) throw new Error("not a GLB — missing the glTF magic");
  if (buf.readUInt32LE(4) !== 2) throw new Error("only glTF 2.0 is supported");
  if (buf.readUInt32LE(8) !== buf.length) throw new Error("declared length does not match the file");

  const jsonLen = buf.readUInt32LE(12);
  if (12 + 8 + jsonLen > buf.length) throw new Error("the JSON chunk runs past the end of the file");
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  } catch {
    throw new Error("the JSON chunk is not valid JSON");
  }
  const meshes = (doc.meshes as unknown[] | undefined) ?? [];
  if (meshes.length === 0) throw new Error("the model contains no meshes");

  const accessors = (doc.accessors as { count?: number }[] | undefined) ?? [];
  let triangles = 0;
  for (const m of meshes as { primitives?: { indices?: number }[] }[]) {
    for (const p of m.primitives ?? []) {
      if (typeof p.indices === "number") triangles += (accessors[p.indices]?.count ?? 0) / 3;
    }
  }
  if (triangles > 200_000) throw new Error(`${Math.round(triangles)} triangles is too heavy for the station`);
  return { meshes: meshes.length, triangles: Math.round(triangles) };
}

export async function GET() {
  return NextResponse.json({ props: await listProps() });
}

async function handlePOST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "send the model as multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `models are capped at ${MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
  }

  const label = String(form.get("label") ?? "").trim().slice(0, 40);
  const role = String(form.get("role") ?? "payload");
  const widthMm = Number(form.get("widthMm") ?? 0);
  const uploader = String(form.get("uploader") ?? "").toLowerCase();

  if (!label) return NextResponse.json({ error: "the model needs a name" }, { status: 400 });
  if (role !== "payload" && role !== "target") {
    return NextResponse.json({ error: "role must be payload or target" }, { status: 400 });
  }
  if (!(widthMm > 0) || widthMm > 2000) {
    return NextResponse.json({ error: "widthMm must be between 0 and 2000" }, { status: 400 });
  }
  if (!/^0x[0-9a-f]{40}$/.test(uploader)) {
    return NextResponse.json({ error: "a wallet address is required" }, { status: 400 });
  }

  // Keyed on the uploading wallet, not the caller's IP. Requests reach this
  // service through a proxy whose egress address changes per request, so an
  // IP bucket gets a fresh key every time and limits nothing. The wallet is
  // the actor that actually claims the upload, and it is stable.
  const gate = rateLimit(`props:${uploader}`, 5, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many uploads from this address. Five a minute." },
      { status: 429, headers: { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }


  const buf = Buffer.from(await file.arrayBuffer());
  let stats: { meshes: number; triangles: number };
  try {
    stats = readGlb(buf);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 415 });
  }

  // The same bytes uploaded twice are the same prop; hand back the first one
  // rather than filling the volume with duplicates.
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const existing = await propBySha(sha256);
  if (existing) return NextResponse.json({ prop: existing, deduplicated: true });

  const id = `u_${sha256.slice(0, 12)}`;
  const row = {
    id, label, role: role as "payload" | "target", width_mm: widthMm,
    bytes: buf.length, sha256, uploader, created_at: Date.now(),
  };
  await insertProp({ ...row, glb: buf });
  return NextResponse.json({ prop: row, ...stats }, { status: 201 });
}

export const POST = logged("/api/props", handlePOST);
