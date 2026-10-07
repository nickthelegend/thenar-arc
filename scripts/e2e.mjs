/**
 * End-to-end proof: record a run, have the server score and sign it, submit it
 * on chain, and confirm the operator was paid in that same transaction.
 *
 *   node scripts/e2e.mjs <base-url>
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.argv[2] ?? "http://localhost:3000";

const env = Object.fromEntries(
  readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};

const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

const abi = parseAbi([
  // The custom errors have to be here or viem cannot name a revert.
  "error AlreadySubmitted()",
  "error BadSignature()",
  "error NoSlots()",
  "error CapReached()",
  "error ScoreTooLow()",
  "error ScoreTooHigh()",
  "error EscrowEmpty()",
  "function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
  "function stats(address) view returns (uint256 runs, uint256 earned, uint256 meanScore)",
]);

const AXON = env.AXON_ADDRESS;
const TASK_ID = Number(process.env.TASK_ID ?? 0);

/** A run that lands 3 mm off the datum over 95 s, driven smoothly. */
function makeRun(seed) {
  const hz = 20, secs = 95, n = hz * secs;
  const from = [0.3, 0.2], goal = [0.17, -0.24];
  const samples = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    samples.push({
      t: Number((i / hz).toFixed(3)),
      q: [0.1 * e, 0.5 * e, 0.9 * e, 0, 1.2 * e, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [
        from[0] + (goal[0] - from[0]) * e + seed * 1e-6,
        from[1] + (goal[1] - from[1]) * e,
        Math.sin(Math.PI * u) * 0.18,
      ],
    });
  }
  const last = samples[samples.length - 1];
  last.object = [goal[0] + 0.003, goal[1], 0];
  return { samples, durationSeconds: secs, deviationMm: 3.0, success: true };
}

const log = (ok, msg, extra = "") =>
  console.log(`${ok ? "  ok  " : " FAIL "} ${msg}${extra ? ` — ${extra}` : ""}`);

let failed = 0;
const check = (ok, msg, extra) => { if (!ok) failed += 1; log(ok, msg, extra); };

console.log(`\nAxon end-to-end · ${BASE}\ncontract ${AXON}\noperator ${account.address}\n`);

// 1 — the API surface a judge would poke
const meta = await (await fetch(`${BASE}/api/contract`)).json();
check(meta.deployed === true, "/api/contract reports a deployed contract", meta.address);
check(meta.chain.id === 10143, "chain is Monad Testnet", String(meta.chain.id));

// 2 — chain state before
const before = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(TASK_ID)] });
const balBefore = await pub.getBalance({ address: account.address });
console.log(`task #${TASK_ID} "${before.name}"  slots ${before.slotsFilled}/${before.slotsTotal}  escrow ${formatEther(before.escrow)} MON\n`);

// 3 — the verifier scores and signs it
const run = makeRun(Date.now() % 1000);
const res = await fetch(`${BASE}/api/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ taskId: TASK_ID, contributor: account.address, ...run }),
});
const v = await res.json();
check(res.ok, "verifier accepted the run", res.ok ? `score ${(v.score / 100).toFixed(2)}` : v.error);
if (!res.ok) process.exit(1);
check(v.accepted === true, "run is above the acceptance floor");
check(/^0x[0-9a-f]{130}$/i.test(v.signature), "verifier returned a 65-byte signature");
check(/^0x[0-9a-f]{64}$/i.test(v.trajHash), "trajectory hash is 32 bytes");

// 4 — the trajectory is retrievable and self-verifying
const doc = await (await fetch(`${BASE}/api/trajectory/${v.trajHash}`)).json();
check(doc.integrity?.matches === true, "stored samples re-hash to the recorded value");
check(doc.sampleCount === run.samples.length, "every sample was persisted", `${doc.sampleCount}`);

// 5 — one transaction records it and pays for it
const hash = await wallet.writeContract({
  address: AXON, abi, functionName: "submitTrajectory",
  args: [BigInt(TASK_ID), v.trajHash, v.cid, v.score, v.signature],
});
console.log(`\n  tx ${hash}`);
const t0 = Date.now();
const receipt = await pub.waitForTransactionReceipt({ hash });
const settleMs = Date.now() - t0;
check(receipt.status === "success", "transaction succeeded", `block ${receipt.blockNumber}, ${settleMs} ms`);

// 6 — the money actually moved, in that same transaction
// The browser flow records the tx against the stored trajectory; do the same
// here so the dataset export and the run page carry it.
await fetch(`${BASE}/api/submitted`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ trajHash: v.trajHash, txHash: hash }),
});
const linked = await (await fetch(`${BASE}/api/trajectory/${v.trajHash}`)).json();
check(linked.txHash === hash, "transaction linked to the stored trajectory");

const after = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(TASK_ID)] });
const balAfter = await pub.getBalance({ address: account.address });
const gas = receipt.gasUsed * receipt.effectiveGasPrice;
const expectedPay = (before.rewardPerTrajectory * BigInt(v.score)) / 10000n;
const netDelta = balAfter - balBefore + gas;

check(after.slotsFilled === before.slotsFilled + 1, "slot count advanced on chain");
check(before.escrow - after.escrow === expectedPay, "escrow fell by exactly the payout", `${formatEther(expectedPay)} MON`);
check(netDelta === expectedPay, "operator balance rose by the payout, net of gas", `${formatEther(netDelta)} MON`);

const stats = await pub.readContract({ address: AXON, abi, functionName: "stats", args: [account.address] });
check(stats[0] > 0n, "contributor stats readable on chain", `${stats[0]} runs, ${formatEther(stats[1])} MON`);

// 7 — replay of the same trajectory must be refused
try {
  await pub.simulateContract({
    address: AXON, abi, functionName: "submitTrajectory", account,
    args: [BigInt(TASK_ID), v.trajHash, v.cid, v.score, v.signature],
  });
  check(false, "replay of the same trajectory is refused");
} catch (e) {
  check(/AlreadySubmitted/.test(e.message ?? ""), "replay of the same trajectory is refused");
}

// 8 — a forged score must be refused
try {
  await pub.simulateContract({
    address: AXON, abi, functionName: "submitTrajectory", account,
    args: [BigInt(TASK_ID), `0x${"ab".repeat(32)}`, v.cid, 10000, v.signature],
  });
  check(false, "a forged score is refused");
} catch (e) {
  check(/BadSignature/.test(e.message ?? ""), "a forged score is refused");
}

console.log(failed === 0 ? "\nall end-to-end checks passed\n" : `\n${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
