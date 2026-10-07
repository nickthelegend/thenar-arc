/**
 * Live, on the local chain: a run that copies a paid route is refused, and nothing is signed.
 *
 *   BASE=http://localhost:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-duplicate.mjs
 *
 * Takes a run already paid on this chain and sends its real samples to
 * /api/verify again. They are sent first as another admitted operator, then as
 * the same operator re-timed. Both times the answer must be the duplicate
 * refusal (409) naming the run it copies, with no signature, so there is
 * nothing a wallet could take to the contract. The chain's trajectory count
 * must not move.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createPublicClient, http, parseAbi } from "viem";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";

const BASE = process.env.BASE ?? "http://localhost:3336";
const chain = createPublicClient({ transport: http(process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645") });
const count = () => chain.readContract({ address: LOCAL_DEPLOYMENT.contracts.axon, abi: parseAbi(["function trajectoryCount() view returns (uint256)"]), functionName: "trajectoryCount" });
const sql = (q) => execFileSync("sqlite3", [".data/localnet.db", q], { encoding: "utf8" }).trim().split("\n").filter(Boolean).map((l) => l.split("|"));

const rows = sql("select traj_hash, task_id, contributor from trajectory where settled = 1 order by created_at desc;");
assert.ok(rows.length >= 2, "needs two paid runs (run test/live-localnet.mjs twice)");
const [hash, taskId, owner] = rows[0];
const other = rows.find((r) => r[2].toLowerCase() !== owner.toLowerCase())?.[2];
assert.ok(other, "needs a second operator with a paid run");

const run = await (await fetch(`${BASE}/api/trajectory/${hash}`)).json();
const samples = run.samples ?? run.trajectory?.samples;
assert.ok(samples?.length > 10, "the stored run has its samples");

const before = await count();
for (const [who, contributor, shift] of [["another operator", other, 0], ["the same operator, re-timed", owner, 0.25]]) {
  const r = await fetch(`${BASE}/api/verify`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: Number(taskId), contributor,
      samples: samples.map((s) => ({ ...s, t: s.t + shift })),
      durationSeconds: run.duration_s ?? run.durationSeconds ?? 8, deviationMm: run.deviation_mm ?? run.deviationMm ?? 5, success: true,
      ...(run.payloadIds ? { payloadIds: run.payloadIds } : {}),
    }),
  });
  const b = await r.json();
  console.log(`${who.padEnd(28)} ${r.status} ${String(b.error).slice(0, 90)}…`);
  assert.equal(r.status, 409, `${who}: refused as a duplicate`);
  assert.equal(b.duplicateOf?.toLowerCase(), hash.toLowerCase(), "it names the run it copies");
  assert.equal(b.signature, undefined, "no signature was issued");
}
assert.equal(await count(), before, "nothing reached the chain");
console.log("LIVE DUPLICATE: PASS");
