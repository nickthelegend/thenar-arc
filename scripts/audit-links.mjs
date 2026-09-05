/**
 * Every stored trajectory must agree with the chain.
 *
 * For each run in the store: if it carries a transaction, that transaction has
 * to exist and have succeeded; if it does not, the chain must genuinely have no
 * record of it. A hash that resolves to nothing, or a run that is on chain but
 * unlinked, is a data-integrity failure and this exits non-zero.
 *
 *   node scripts/audit-links.mjs <base-url>
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbiItem } from "viem";

const BASE = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };
const pub = createPublicClient({ chain, transport: http() });

const ACCEPTED = parseAbiItem(
  "event TrajectoryAccepted(uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor, bytes32 trajHash, string cid, uint16 score, uint256 paid)"
);

/** The public RPC caps a getLogs range, so walk back in windows. */
async function findOnChain(trajHash, windows = 200, size = 100n) {
  const head = await pub.getBlockNumber();
  for (let end = head; end > head - BigInt(windows) * size; end -= size) {
    let logs = [];
    try { logs = await pub.getLogs({ address: env.AXON_ADDRESS, event: ACCEPTED, fromBlock: end - size + 1n, toBlock: end }); }
    catch { continue; }
    const hit = logs.find(l => String(l.args.trajHash).toLowerCase() === trajHash.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const feed = await (await fetch(`${BASE}/api/feed?limit=50`)).json();
console.log(`\nTrajectory ledger integrity · ${BASE}\n${feed.total} stored\n`);

for (const run of feed.runs) {
  const short = `${run.traj_hash.slice(0, 14)}… task ${run.task_id}`;
  if (run.tx_hash) {
    let receipt = null;
    try { receipt = await pub.getTransactionReceipt({ hash: run.tx_hash }); } catch { /* absent */ }
    check(Boolean(receipt), `${short}: its transaction exists on chain`, run.tx_hash.slice(0, 20));
    if (receipt) check(receipt.status === "success", `${short}: that transaction succeeded`);
  } else {
    const onChain = await findOnChain(run.traj_hash);
    check(!onChain, `${short}: unlinked, and genuinely absent from the chain`,
      onChain ? `IT IS ON CHAIN at ${onChain.transactionHash} — link it` : "verified but never submitted");
  }
}

console.log(failed === 0 ? "\nledger agrees with the chain\n" : `\n${failed} discrepancy(ies)\n`);
process.exit(failed ? 1 : 0);
