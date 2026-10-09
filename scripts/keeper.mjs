/**
 * The audit keeper: checks the corpus this server sells against the roots
 * the verifier committed, and writes what it found to CorpusAudit on Arc.
 * Anyone can run the same check from the public API.
 *
 * Each pass:
 *  1. For every task, fetch the episode hashes the app would sell from its
 *     public API (/api/corpus/episodes?tasks=…), build the Merkle root itself
 *     with lib/merkle.ts, read CorpusManifest.latest(task), and classify:
 *     uncommitted, matches, grown, short or altered.
 *  2. Write the findings that changed since the last audit (all of them with
 *     --force) in one CorpusAudit.onReport(abi.encode(uint64 observedAt,
 *     Finding[])) from AUDITOR_PRIVATE_KEY (the corpus issuer's key if unset).
 *  3. For each ThenarCcipReceiver order still Pending (its CCIP message came
 *     before its CCTP dollars), call executePending once the dollars are there.
 *
 *   NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/keeper.mjs [baseUrl] [--once] [--force]
 *
 * Without --once it repeats every KEEPER_INTERVAL seconds (default 60).
 */
import { createPublicClient, createWalletClient, encodeAbiParameters, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootOf } from "../lib/merkle.ts";
import { AXON_ABI } from "../lib/abi.ts";
import { CORPUS_AUDIT_ABI, THENAR_CCIP_RECEIVER_ABI } from "../lib/registry-abi.ts";
import { ADDR, DEPLOY_BLOCK, env, appChain, need, transport, txUrl } from "./arc.mjs";

const argv = process.argv.slice(2);
const ONCE = argv.includes("--once");
const FORCE = argv.includes("--force");
const BASE = (argv.find((a) => !a.startsWith("--")) ?? env("LOCAL_APP_URL") ?? "http://localhost:9010").replace(/\/$/, "");
const INTERVAL = Number(env("KEEPER_INTERVAL") ?? 60) * 1000;

const PROTOCOL = need(ADDR.protocol, "ThenarProtocol's address");
const MANIFEST = need(ADDR.corpusManifest, "CorpusManifest's address");
const AUDIT = need(ADDR.corpusAudit, "CorpusAudit's address");
const auditor = privateKeyToAccount(need(env("AUDITOR_PRIVATE_KEY") ?? env("CORPUS_ISSUER_PRIVATE_KEY"), "AUDITOR_PRIVATE_KEY (or CORPUS_ISSUER_PRIVATE_KEY)"));
const executor = privateKeyToAccount(env("RELAYER_PRIVATE_KEY") ?? env("AUDITOR_PRIVATE_KEY") ?? env("CORPUS_ISSUER_PRIVATE_KEY"));

const pub = createPublicClient({ chain: appChain, transport: transport(), pollingInterval: 500 });
const writer = (account) => createWalletClient({ account, chain: appChain, transport: transport() });

const MANIFEST_ABI = parseAbi(["function latest(uint256 taskId) view returns ((bytes32 root, uint32 episodes, uint64 at))"]);
const VERDICT = ["uncommitted", "matches", "grown", "short", "altered"];
const ZERO = `0x${"0".repeat(64)}`;
const FINDINGS = [{
  type: "tuple[]",
  components: [
    { name: "taskId", type: "uint256" }, { name: "servedRoot", type: "bytes32" }, { name: "committedRoot", type: "bytes32" },
    { name: "served", type: "uint32" }, { name: "committed", type: "uint32" }, { name: "verdict", type: "uint8" },
  ],
}];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function served(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const r = await fetch(`${BASE}/api/corpus/episodes?tasks=${chunk.join(",")}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`${BASE}/api/corpus/episodes answered ${r.status}`);
    const body = await r.json();
    if (body.protocol && body.protocol.toLowerCase() !== PROTOCOL.toLowerCase()) {
      throw new Error(`the app at ${BASE} serves protocol ${body.protocol}, not ${PROTOCOL}`);
    }
    for (const t of body.tasks) out.set(Number(t.taskId), t.episodes);
  }
  return out;
}

async function audit() {
  const count = Number(await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "taskCount" }));
  const ids = Array.from({ length: count }, (_, i) => i);
  const episodes = await served(ids);
  const findings = [];
  for (const taskId of ids) {
    const leaves = episodes.get(taskId) ?? [];
    const committed = await pub.readContract({ address: MANIFEST, abi: MANIFEST_ABI, functionName: "latest", args: [BigInt(taskId)] }).catch(() => null);
    if (!leaves.length && !committed) continue; // nothing served and nothing promised: nothing to say
    const servedRoot = leaves.length ? rootOf(leaves) : ZERO;
    const verdict = !committed ? 0
      : servedRoot.toLowerCase() === committed.root.toLowerCase() ? 1
        : leaves.length > committed.episodes ? 2
          : leaves.length < committed.episodes ? 3 : 4;
    const f = {
      taskId: BigInt(taskId), servedRoot, committedRoot: committed?.root ?? ZERO,
      served: leaves.length, committed: committed ? Number(committed.episodes) : 0, verdict,
    };
    const held = await pub.readContract({ address: AUDIT, abi: CORPUS_AUDIT_ABI, functionName: "latest", args: [BigInt(taskId)] });
    const same = held.observedAt > 0n && held.verdict === verdict && held.servedRoot.toLowerCase() === servedRoot.toLowerCase()
      && held.committedRoot.toLowerCase() === f.committedRoot.toLowerCase();
    log(`task ${taskId}: ${VERDICT[verdict]} (served ${f.served}, committed ${f.committed})${same && !FORCE ? " unchanged" : ""}`);
    if (!same || FORCE) findings.push(f);
  }
  if (!findings.length) return log("audit: nothing new to report");
  const report = encodeAbiParameters([{ type: "uint64" }, ...FINDINGS], [BigInt(Math.floor(Date.now() / 1000)), findings]);
  const hash = await writer(auditor).writeContract({ address: AUDIT, abi: CORPUS_AUDIT_ABI, functionName: "onReport", args: [report] });
  const r = await pub.waitForTransactionReceipt({ hash });
  log(`audit: ${findings.length} finding(s) written to CorpusAudit, ${r.status}  ${txUrl(hash)}`);
}

async function pending() {
  const receiver = ADDR.ccipReceiver;
  if (!receiver) return;
  const head = await pub.getBlockNumber();
  const ids = new Set();
  const event = parseAbiItem("event OrderPending(bytes32 indexed orderId, uint256 available, uint256 amount)");
  // Arc's public RPC answers getLogs over at most 10,000 blocks.
  for (let from = DEPLOY_BLOCK; from <= head; from += 10_000n) {
    const to = from + 9_999n < head ? from + 9_999n : head;
    for (const l of await pub.getLogs({ address: receiver, event, fromBlock: from, toBlock: to })) ids.add(l.args.orderId);
  }
  if (!ids.size) return log("ccip: no pending orders");
  for (const orderId of ids) {
    const o = await pub.readContract({ address: receiver, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "getOrder", args: [orderId] });
    if (Number(o.status) !== 1) continue;
    try {
      const { request } = await pub.simulateContract({ account: executor, address: receiver, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "executePending", args: [orderId] });
      const hash = await writer(executor).writeContract(request);
      const r = await pub.waitForTransactionReceipt({ hash });
      log(`ccip: order ${orderId.slice(0, 10)}… licensed (${r.status})  ${txUrl(hash)}`);
    } catch (e) {
      log(`ccip: order ${orderId.slice(0, 10)}… still pending: ${e.shortMessage ?? e.message?.split("\n")[0]}`);
    }
  }
}

async function pass() {
  try { await audit(); } catch (e) { log(`audit failed: ${e.shortMessage ?? e.message}`); }
  try { await pending(); } catch (e) { log(`ccip failed: ${e.shortMessage ?? e.message}`); }
}

log(`keeper on ${appChain.name} (${appChain.id}) reading ${BASE}; auditor ${auditor.address}`);
await pass();
if (!ONCE) setInterval(pass, INTERVAL);
