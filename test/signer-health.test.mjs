import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fetchSignerHealth } from "../lib/server/signer-health.ts";

async function withSigner(handler, check) {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await check(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("signer health accepts a successful response and normalises a trailing slash", async () => {
  await withSigner((req, res) => {
    assert.equal(req.url, "/api/sign");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ holdsKey: true, verifier: "address", canonical: "hash" }));
  }, async origin => assert.deepEqual(await fetchSignerHealth(`${origin}/`), {
    holdsKey: true, verifier: "address", canonical: "hash",
  }));
});

test("HTTP failure is unhealthy even if its JSON claims a key", async () => {
  await withSigner((_req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ holdsKey: true }));
  }, async origin => assert.rejects(fetchSignerHealth(origin), /HTTP 503/));
});

test("a stalled signer cannot hold health checks open indefinitely", async () => {
  await withSigner((_req, _res) => {}, async origin => {
    await assert.rejects(fetchSignerHealth(origin, 25), { name: "TimeoutError" });
  });
});
