import { getPropBlob } from "@/lib/server/db";

export const runtime = "nodejs";

/** Serve an uploaded model. Content-addressed, so it can be cached forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getPropBlob(id);
  // JSON, like every other error this API returns. The success body here is a
  // binary GLB, so nothing forced the error to match — but a client that parses
  // {"error":…} everywhere else should not have to special-case one route to
  // find out why a model is missing.
  if (!row) {
    return new Response(JSON.stringify({ error: "no such model" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(new Uint8Array(row.glb), {
    headers: {
      "content-type": "model/gltf-binary",
      "content-length": String(row.bytes),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
