/**
 * Exercise the full task lifecycle on chain: create a funded task, fill every
 * slot, mint its policy, and buy a licence — proving the cap table splits.
 *
 *   node scripts/lifecycle.mjs <base-url>
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
  "error AlreadySubmitted()", "error BadSignature()", "error NotFilled()", "error AlreadyMinted()", "error WrongFee()",
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

function makeRun(seed) {
  const hz = 20, secs = 92, n = hz * secs;
  const from = [0.3, 0.2], goal = [0.17, -0.24];
  const samples = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    samples.push({
      t: +(i / hz).toFixed(3),
      q: [0.1 * e, 0.5 * e, 0.9 * e, 0, 1.2 * e, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [from[0] + (goal[0] - from[0]) * e + seed * 1e-7, from[1] + (goal[1] - from[1]) * e, Math.sin(Math.PI * u) * 0.18],
    });
  }
  samples[samples.length - 1].object = [goal[0] + 0.004, goal[1], 0];
  return { samples, durationSeconds: secs, deviationMm: 4.0, success: true };
}

console.log(`\nAxon task lifecycle · ${BASE}\ncontract ${AXON}\n`);

// --- a two-slot task so it can actually fill -------------------------------
const REWARD = parseEther("0.002");
const SLOTS = 2;
let hash = await wallet.writeContract({
  address: AXON, abi, functionName: "createTask",
  args: ["Place the calibration puck on the datum", SLOTS, REWARD, 4, 2],
  value: REWARD * BigInt(SLOTS),
});
let r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "createTask confirmed", hash.slice(0, 18));
const taskId = Number(await pub.readContract({ address: AXON, abi, functionName: "taskCount" })) - 1;
console.log(`  task #${taskId}, ${SLOTS} slots at ${formatEther(REWARD)} MON\n`);

// --- fill every slot -------------------------------------------------------
const contributors = [];
for (let i = 0; i < SLOTS; i++) {
  const res = await fetch(`${BASE}/api/verify`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId, contributor: owner.address, ...makeRun(Date.now() + i) }),
  });
  const v = await res.json();
  if (!res.ok) { check(false, `verify run ${i + 1}`, v.error); break; }
  hash = await wallet.writeContract({
    address: AXON, abi, functionName: "submitTrajectory",
    args: [BigInt(taskId), v.trajHash, v.cid, v.score, v.signature],
  });
  r = await pub.waitForTransactionReceipt({ hash });
  await fetch(`${BASE}/api/submitted`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ trajHash: v.trajHash, txHash: hash }),
  });
  check(r.status === "success", `run ${i + 1}/${SLOTS} settled`, `score ${(v.score / 100).toFixed(2)}`);
  contributors.push(owner.address);
}

const filled = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(taskId)] });
check(filled.slotsFilled === SLOTS, "task reports every slot filled", `${filled.slotsFilled}/${filled.slotsTotal}`);

// --- mint the policy -------------------------------------------------------
const FEE = parseEther("0.01");
hash = await wallet.writeContract({ address: AXON, abi, functionName: "mintPolicy", args: [BigInt(taskId), FEE] });
r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "mintPolicy confirmed", hash.slice(0, 18));
const policyId = Number(await pub.readContract({ address: AXON, abi, functionName: "policyCount" })) - 1;

const cap = await pub.readContract({ address: AXON, abi, functionName: "capTable", args: [BigInt(policyId)] });
check(cap[0].length > 0, "cap table snapshotted", `${cap[0].length} contributor(s)`);
const bpsTotal = cap[1].reduce((a, b) => a + b, 0n);
check(bpsTotal >= 9990n && bpsTotal <= 10000n, "weights sum to 100%", `${Number(bpsTotal) / 100}%`);

// --- buy a licence and watch the split ------------------------------------
const buyer = privateKeyToAccount(generatePrivateKey());
// Monad reserves against the gas *limit*, not gas used, and in practice the
// floor is far above value + gas: the same licence call reverted with "Signer
// had insufficient balance" at 0.3 MON and settled at 2 MON. Fund generously.
const fundTx = await wallet.sendTransaction({ to: buyer.address, value: parseEther("2") });
await pub.waitForTransactionReceipt({ hash: fundTx });

// Monad pipelines consensus and execution separately: a receipt means the
// transaction was ordered, not that its state change has been applied. A
// freshly funded account can still fail the reserve check on the very next
// transaction, so wait for the balance to actually appear.
async function awaitFunds(addr, want) {
  for (let i = 0; i < 40; i++) {
    if ((await pub.getBalance({ address: addr })) >= want) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
check(await awaitFunds(buyer.address, parseEther("2")), "buyer funds visible after execution catches up");
await new Promise((r) => setTimeout(r, 1500));
const buyerWallet = createWalletClient({ account: buyer, chain, transport: http() });

const before = await pub.getBalance({ address: owner.address });
hash = await buyerWallet.writeContract({ address: AXON, abi, functionName: "licensePolicy", args: [BigInt(policyId)], value: FEE });
r = await pub.waitForTransactionReceipt({ hash });
check(r.status === "success", "licensePolicy confirmed — one tx, whole cap table", hash.slice(0, 18));

const after = await pub.getBalance({ address: owner.address });
const gained = after - before;
const capShare = cap[2].reduce((a, b) => a + b, 0n);
check(gained > 0n, "contributor was paid by the licence", `${formatEther(gained)} MON`);

// This deployment set the treasury to the deployer, and the deployer is also
// the sole contributor here, so one address collects both the cap-table share
// and the 2.5% protocol fee. The invariant that matters is conservation.
const treasuryIsContributor = true;
const expected = treasuryIsContributor ? FEE : capShare;
check(
  gained === expected,
  treasuryIsContributor
    ? "received the cap-table share plus the protocol fee"
    : "paid exactly what the cap table promised",
  `cap share ${formatEther(capShare)} + fee ${formatEther(FEE - capShare)} = ${formatEther(expected)}`,
);
check(capShare === (FEE * 9750n) / 10000n, "cap table is the fee net of the 2.5% protocol take",
      `${formatEther(capShare)} of ${formatEther(FEE)}`);

const pol = await pub.readContract({ address: AXON, abi, functionName: "getPolicy", args: [BigInt(policyId)] });
check(pol.licencesSold === 1, "licence counted on chain");

console.log(failed === 0 ? "\nfull lifecycle passed on chain\n" : `\n${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
