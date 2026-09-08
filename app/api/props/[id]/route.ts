import { getPropBlob } from "@/lib/server/db";

export const runtime = "nodejs";

/** Serve an uploaded model. Content-addressed, so it can be cached forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getPropBlob(id);
  if (!row) return new Response("no such model", { status: 404 });
  return new Response(new Uint8Array(row.glb), {
    headers: {
      "content-type": "model/gltf-binary",
      "content-length": String(row.bytes),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
