/**
 * Every stored trajectory must agree with the chain.
 *
 * For each run in the store: if it carries a transaction, that transaction has
 * to exist and have succeeded; if it does not, the chain must genuinely have no
 * record of it. A hash that resolves to nothing, or a run that is on chain but
 * unlinked, is a data-integrity failure and this exits non-zero.
 *
 *   node --import ./test/register.mjs scripts/audit-links.mjs <base-url>
 */
import { createPublicClient, parseAbiItem } from "viem";
import { AXON_ABI } from "../lib/abi.ts";
import { appChain, transport, ADDR, need } from "./monad.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const AXON = need(ADDR.axon, "AxonProtocolV2's address (lib/deployment.ts, or NEXT_PUBLIC_AXON_ADDRESS)");
const pub = createPublicClient({ chain: appChain, transport: transport() });

const ACCEPTED = parseAbiItem(
  "event TrajectoryAccepted(uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor, bytes32 trajHash, string cid, uint16 score, uint256 paid)"
);

/**
 * Every trajectory the contract holds, keyed by hash, read from storage.
 *
 * This used to walk getLogs back from the head in hundred-block windows, which
 * is the widest range Monad's public endpoints answer. Two hundred windows is
 * twenty thousand blocks — a couple of hours on this chain — so a run recorded
 * the day before would be reported "genuinely absent" while it sat on chain.
 * The contract keeps every trajectory in an array, with the block it was
 * accepted in, so the audit reads that instead and reaches the whole history
 * however old it is.
 */
async function onChainTrajectories() {
  const n = Number(await pub.readContract({ address: AXON, abi: AXON_ABI, functionName: "trajectoryCount" }));
  const byHash = new Map();
  for (let from = 0; from < n; from += 200) {
    const ids = Array.from({ length: Math.min(200, n - from) }, (_, k) => BigInt(from + k));
    const rows = await pub.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({ address: AXON, abi: AXON_ABI, functionName: "getTrajectory", args: [id] })),
    });
    rows.forEach((t, k) => byHash.set(String(t.trajHash).toLowerCase(), { id: ids[k], ...t }));
  }
  return byHash;
}

/** The transaction that accepted a trajectory: storage names the block, so one
 *  single-block getLogs finds it, well inside the endpoint's cap. */
async function acceptedIn(t) {
  const logs = await pub.getLogs({
    address: AXON, event: ACCEPTED, args: { trajectoryId: t.id },
    fromBlock: t.atBlock, toBlock: t.atBlock,
  }).catch(() => []);
  return logs[0]?.transactionHash ?? null;
}

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const feed = await (await fetch(`${BASE}/api/feed?limit=50`)).json();
const recorded = await onChainTrajectories();
console.log(`\nTrajectory ledger integrity · ${BASE}\n${feed.total} stored, ${recorded.size} on chain\n`);

for (const run of feed.runs) {
  const short = `${run.traj_hash.slice(0, 14)}… task ${run.task_id}`;
  if (run.tx_hash) {
    let receipt = null;
    try { receipt = await pub.getTransactionReceipt({ hash: run.tx_hash }); } catch { /* absent */ }
    check(Boolean(receipt), `${short}: its transaction exists on chain`, run.tx_hash.slice(0, 20));
    if (receipt) check(receipt.status === "success", `${short}: that transaction succeeded`);
  } else {
    const onChain = recorded.get(run.traj_hash.toLowerCase());
    const tx = onChain ? await acceptedIn(onChain) : null;
    check(!onChain, `${short}: unlinked, and genuinely absent from the chain`,
      onChain
        ? `IT IS ON CHAIN as trajectory ${onChain.id}, block ${onChain.atBlock}${tx ? `, tx ${tx}` : ""} — link it`
        : "verified but never submitted");
  }
}

console.log(failed === 0 ? "\nledger agrees with the chain\n" : `\n${failed} discrepancy(ies)\n`);
process.exit(failed ? 1 : 0);
