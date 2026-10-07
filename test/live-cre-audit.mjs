/**
 * Live, on the local chain: the corpus-audit CRE workflow's logic and its
 * on-chain receiver, without a DON.
 *
 *   BASE=http://localhost:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-cre-audit.mjs
 *
 * Needs the local chain, the local build, and at least one paid run (test/live-localnet.mjs).
 *
 * 1. /api/corpus/episodes, reduced by cre/corpus-audit/audit.ts the way every
 *    node of the DON reduces it, gives the same root for every task as
 *    Thenar's own lib/merkle.ts and as /api/task/{id}/manifest.
 * 2. Read through Multicall3 as the workflow reads it, a task nobody has
 *    committed is Uncommitted; once the verifier commits its root it Matches;
 *    a commitment to fewer episodes reads as Grown, and one to a different
 *    set of the same size as Altered.
 * 3. CorpusAudit, deployed here with a stand-in forwarder, decodes the report
 *    the workflow encodes, stores each verdict, refuses any other caller, and
 *    ignores a report older than the one it holds.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";
import { rootOf } from "../lib/merkle.ts";
import { readEnvFile } from "../scripts/monad.mjs";
import {
  committedCall, committedFrom, encodeReport, findingsOf, MULTICALL3, servedFrom, Verdict,
} from "../cre/corpus-audit/audit.ts";

const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const env = readEnvFile(".env.localnet");
const chain = { id: 31337, name: "Thenar Localnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const verifier = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(env.VERIFIER_PRIVATE_KEY) });
// Anvil's published account #7 stands in for the KeystoneForwarder, #8 for anyone else.
const forwarder = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount("0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356") });
const stranger = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount("0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97") });
const MANIFEST = LOCAL_DEPLOYMENT.contracts.corpusManifest;
const NAMES = Object.fromEntries(Object.entries(Verdict).map(([k, v]) => [v, k]));
const log = (k, v) => console.log(k.padEnd(10), typeof v === "string" ? v : JSON.stringify(v));

// 1. The roots the DON would agree on, against Thenar's own.
const body = await (await fetch(`${BASE}/api/corpus/episodes`)).json();
const served = servedFrom(body, 31337);
assert.ok(served.length >= 1, "at least one task has paid episodes (run test/live-localnet.mjs first)");
for (const s of served) {
  const t = body.tasks.find((x) => x.taskId === s.taskId);
  const manifest = await (await fetch(`${BASE}/api/task/${s.taskId}/manifest`)).json();
  assert.equal(s.root, rootOf(t.episodes), `task ${s.taskId}: the workflow's root is lib/merkle.ts's root`);
  assert.equal(s.root, manifest.computed, `task ${s.taskId}: and the manifest route's`);
  assert.equal(s.episodes, manifest.episodes);
}
log("roots", served.map((s) => ({ task: s.taskId, episodes: s.episodes, root: `${s.root.slice(0, 12)}…` })));

// 2. Verdicts from the chain, read exactly as the workflow reads them.
const readCommitted = async (tasks) =>
  committedFrom((await pub.call({ to: MULTICALL3, data: committedCall(MANIFEST, tasks.map((s) => s.taskId)) })).data);
const commit = async (taskId, root, episodes) => {
  const hash = await verifier.writeContract({
    address: MANIFEST, abi: parseAbi(["function commit(uint256 taskId, bytes32 root, uint32 episodes)"]),
    functionName: "commit", args: [BigInt(taskId), root, episodes],
  });
  assert.equal((await pub.waitForTransactionReceipt({ hash })).status, "success");
};
const task = served[0];
const verdictNow = async () => findingsOf([task], await readCommitted([task]))[0];

const before = await verdictNow();
const fresh = before.verdict === Verdict.Uncommitted;
log("before", NAMES[before.verdict]);
// Each commitment below is a new version; the newest is what latest() returns.
// Distinct roots each time: CorpusManifest refuses a root equal to the latest.
const other = (n) => keccak256(toHex(`not task ${task.taskId}'s corpus, ${n}`));
await commit(task.taskId, other(1), task.episodes);
assert.equal((await verdictNow()).verdict, Verdict.Altered, "same size, different set: Altered");
if (task.episodes > 1) {
  await commit(task.taskId, other(2), task.episodes + 1);
  assert.equal((await verdictNow()).verdict, Verdict.Short, "more committed than served: Short");
}
await commit(task.taskId, other(3), Math.max(0, task.episodes - 1) || 1);
const shrunk = await verdictNow();
if (task.episodes > 1) assert.equal(shrunk.verdict, Verdict.Grown, "fewer committed than served: Grown");
await commit(task.taskId, task.root, task.episodes);
const matched = await verdictNow();
assert.equal(matched.verdict, Verdict.Matches, "the verifier's own root: Matches");
log("verdicts", { untouched: fresh ? "Uncommitted" : NAMES[before.verdict], altered: "Altered", matches: NAMES[matched.verdict] });

// 3. The receiver: deploy, deliver the workflow's report, read it back.
const artifact = JSON.parse(readFileSync("contracts/out/CorpusAudit.sol/CorpusAudit.json", "utf8"));
const deployHash = await forwarder.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [forwarder.account.address] });
const audit = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress;
const all = findingsOf(served, await readCommitted(served));
const observedAt = BigInt(Math.floor(Date.now() / 1000));
const metadata = toHex(new Uint8Array(64)); // the 64 bytes the production forwarder passes
const deliver = (from, at) => from.writeContract({ address: audit, abi: artifact.abi, functionName: "onReport", args: [metadata, encodeReport(at, all)] });

await assert.rejects(pub.simulateContract({ address: audit, abi: artifact.abi, functionName: "onReport", args: [metadata, encodeReport(observedAt, all)], account: stranger.account }), /InvalidSender/, "only the forwarder may deliver");
const r = await pub.waitForTransactionReceipt({ hash: await deliver(forwarder, observedAt) });
assert.equal(r.status, "success");
for (const f of all) {
  const a = await pub.readContract({ address: audit, abi: artifact.abi, functionName: "latest", args: [f.taskId] });
  assert.equal(a.verdict, f.verdict, `task ${f.taskId}: the stored verdict is the reported one`);
  assert.equal(a.servedRoot, f.servedRoot);
  assert.equal(a.committedRoot, f.committedRoot);
  assert.equal(a.observedAt, observedAt);
}
// A retried, older report changes nothing.
await pub.waitForTransactionReceipt({ hash: await deliver(forwarder, observedAt - 60n) });
const kept = await pub.readContract({ address: audit, abi: artifact.abi, functionName: "latest", args: [all[0].taskId] });
assert.equal(kept.observedAt, observedAt, "an older report is discarded");
const count = await pub.readContract({ address: audit, abi: artifact.abi, functionName: "findings" });
assert.equal(count, BigInt(all.length));
log("receiver", { audit, gasUsed: String(r.gasUsed), stored: all.map((f) => ({ task: String(f.taskId), verdict: NAMES[f.verdict] })) });
console.log("LIVE CRE AUDIT: PASS");
