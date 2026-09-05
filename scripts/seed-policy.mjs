/**
 * Seed a policy whose cap table actually fans out: one task filled by four
 * distinct operators at four distinct scores, minted, then licensed once.
 * Every step is a real signed transaction against the deployed contract.
 *
 *   node scripts/seed-policy.mjs <base-url>
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, formatEther, parseEther, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)];
  }),
);

const chain = {
  id: 10143, name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
};

const abi = parseAbi([
  "function createTask(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty) payable returns (uint256)",
  "function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
  "function mintPolicy(uint256 taskId, uint128 licenceFee) returns (uint256)",
  "function licensePolicy(uint256 policyId) payable",
  "function taskCount() view returns (uint256)",
  "function policyCount() view returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
  "function capTable(uint256) view returns (address[] who, uint256[] weightBps, uint256[] payout)",
  "function getPolicy(uint256) view returns ((uint256 taskId, address minter, uint32 trajectories, uint64 mintedAt, uint128 licenceFee, uint32 licencesSold, uint128 distributed))",
]);

const AXON = env.AXON_ADDRESS;
const pub = createPublicClient({ chain, transport: http() });
const owner = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account: owner, chain, transport: http() });

let failed = 0;
const check = (ok, msg, extra = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${msg}${extra ? ` — ${extra}` : ""}`); };

// Monad reserves value + gas_limit * price and settles execution behind
// consensus, so a freshly funded key must be waited for, not assumed.
async function awaitFunds(addr, want) {
  for (let i = 0; i < 60; i++) {
    if ((await pub.getBalance({ address: addr })) >= want) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// Four operators of visibly different skill, so the weights differ and the cap
// table draws four bars of four lengths rather than one full-width block.
const OPERATORS = [
  { label: "steady",   deviationMm: 1.8, secs: 78,  ease: 0.5  },
  { label: "quick",    deviationMm: 3.4, secs: 64,  ease: 0.42 },
  { label: "careful",  deviationMm: 2.6, secs: 104, ease: 0.58 },
  { label: "scrappy",  deviationMm: 6.1, secs: 88,  ease: 0.36 },
];

function makeRun({ deviationMm, secs, ease }, seed) {
  const hz = 20, n = hz * secs;
  const from = [0.3, 0.2], goal = [0.17, -0.24];
  const samples = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const e = u < ease ? (u / ease) * (u / ease) * ease : 1 - Math.pow(1 - u, 2) * (1 - ease) / (1 - ease) * (1 - ease);
    const p = Math.min(1, Math.max(0, e));
    samples.push({
      t: +(i / hz).toFixed(3),
      q: [0.1 * p, 0.5 * p, 0.9 * p, 0, 1.2 * p, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [from[0] + (goal[0] - from[0]) * p + seed * 1e-9, from[1] + (goal[1] - from[1]) * p, Math.sin(Math.PI * u) * 0.18],
    });
  }
  const off = deviationMm / 1000;
  samples[samples.length - 1].object = [goal[0] + off, goal[1], 0];
  return { samples, durationSeconds: secs, deviationMm, success: true };
}

console.log(`\nAxon cap-table seed · ${BASE}\ncontract ${AXON}\n`);
console.log(`deployer balance ${formatEther(await pub.getBalance({ address: owner.address }))} MON\n`);

const REWARD = parseEther("0.002");
const SLOTS = OPERATORS.length;
let hash = await wallet.writeContract({
  address: AXON, abi, functionName: "createTask",
  args: ["Stack the aligned block on the datum pad", SLOTS, REWARD, 2, 3],
  value: REWARD * BigInt(SLOTS),
});
let r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "createTask confirmed", hash.slice(0, 18));
const taskId = Number(await pub.readContract({ address: AXON, abi, functionName: "taskCount" })) - 1;
console.log(`  task #${taskId}, ${SLOTS} slots at ${formatEther(REWARD)} MON each\n`);

// Fund all four operators up front, then let execution catch up once.
const ops = OPERATORS.map((o) => ({ ...o, account: privateKeyToAccount(generatePrivateKey()) }));
for (const o of ops) {
  const f = await wallet.sendTransaction({ to: o.account.address, value: parseEther("2") });
  await pub.waitForTransactionReceipt({ hash: f });
}
for (const o of ops) {
  check(await awaitFunds(o.account.address, parseEther("2")), `operator ${o.label} funded`, o.account.address.slice(0, 10));
}
await new Promise((res) => setTimeout(res, 1500));

for (let i = 0; i < ops.length; i++) {
  const o = ops[i];
  const res = await fetch(`${BASE}/api/verify`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId, contributor: o.account.address, ...makeRun(o, i + 1) }),
  });
  const v = await res.json();
  if (!res.ok) { check(false, `verify ${o.label}`, v.error); continue; }
  const w = createWalletClient({ account: o.account, chain, transport: http() });
  hash = await w.writeContract({
    address: AXON, abi, functionName: "submitTrajectory",
    args: [BigInt(taskId), v.trajHash, v.cid, v.score, v.signature],
  });
  r = await pub.waitForTransactionReceipt({ hash });
  await fetch(`${BASE}/api/submitted`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ trajHash: v.trajHash, txHash: hash }),
  });
  check(r.status === "success", `${o.label} settled`, `score ${(v.score / 100).toFixed(2)}`);
}

const filled = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(taskId)] });
check(filled.slotsFilled === SLOTS, "every slot filled", `${filled.slotsFilled}/${filled.slotsTotal}`);

const FEE = parseEther("0.02");
hash = await wallet.writeContract({ address: AXON, abi, functionName: "mintPolicy", args: [BigInt(taskId), FEE] });
r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "mintPolicy confirmed", hash.slice(0, 18));
const policyId = Number(await pub.readContract({ address: AXON, abi, functionName: "policyCount" })) - 1;

const cap = await pub.readContract({ address: AXON, abi, functionName: "capTable", args: [BigInt(policyId)] });
check(cap[0].length === SLOTS, "cap table has every contributor", `${cap[0].length} contributors`);
const bpsTotal = cap[1].reduce((a, b) => a + b, 0n);
check(bpsTotal >= 9990n && bpsTotal <= 10000n, "weights sum to 100%", `${Number(bpsTotal) / 100}%`);
const distinct = new Set(cap[1].map(String)).size;
check(distinct > 1, "weights actually differ between operators", `${distinct} distinct weights: ${cap[1].map((b) => (Number(b) / 100).toFixed(2) + "%").join(", ")}`);

const buyer = privateKeyToAccount(generatePrivateKey());
const fundTx = await wallet.sendTransaction({ to: buyer.address, value: parseEther("2") });
await pub.waitForTransactionReceipt({ hash: fundTx });
check(await awaitFunds(buyer.address, parseEther("2")), "buyer funded");
await new Promise((res) => setTimeout(res, 1500));

const before = await Promise.all(cap[0].map((a) => pub.getBalance({ address: a })));
const buyerWallet = createWalletClient({ account: buyer, chain, transport: http() });
hash = await buyerWallet.writeContract({ address: AXON, abi, functionName: "licensePolicy", args: [BigInt(policyId)], value: FEE });
r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "licensePolicy confirmed — one tx pays all four", hash.slice(0, 18));

await new Promise((res) => setTimeout(res, 1500));
const after = await Promise.all(cap[0].map((a) => pub.getBalance({ address: a })));
for (let i = 0; i < cap[0].length; i++) {
  const gained = after[i] - before[i];
  check(gained === cap[2][i], `contributor ${i + 1} paid exactly the cap-table share`, `${formatEther(gained)} MON`);
}

const pol = await pub.readContract({ address: AXON, abi, functionName: "getPolicy", args: [BigInt(policyId)] });
check(pol.licencesSold === 1, "licence counted on chain");
console.log(`\npolicy #${policyId} on task #${taskId}\n`);
console.log(failed === 0 ? "cap-table seed passed on chain\n" : `${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
