/**
 * Add task bounties one at a time, waiting for execution to catch up.
 *
 * Batching these through a script fails intermittently on Monad: consensus and
 * execution are pipelined, so a receipt means a transaction was ordered, not
 * that its value deduction has been applied — and the next transaction's
 * balance check can fail against state that has not caught up yet.
 *
 *   node scripts/seed-tasks.mjs
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };
const abi = parseAbi([
  "function createTask(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty) payable returns (uint256)",
  "function taskCount() view returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
]);

const AXON = process.env.AXON ?? env.AXON_ADDRESS;
const pub = createPublicClient({ chain, transport: http() });
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain, transport: http() });

/** name, slots, reward, scenario, difficulty */
const WANTED = [
  ["Put the toothpaste into the upper drawer", 32, "0.004", 3, 3],
  ["Put the apricot into the air fryer", 24, "0.003", 1, 2],
  ["Put the pen on the closed laptop", 12, "0.003", 2, 2],
  ["Put the shrimp to the left of the honey jar", 8, "0.006", 1, 4],
  ["Rotate the dice to show four", 8, "0.008", 6, 5],
  ["Insert the eraser into the pen cup", 16, "0.003", 2, 3],
  ["Stack the honey jar behind the toast", 8, "0.005", 1, 4],
  ["Reach the far shelf and place the mug", 6, "0.009", 5, 5],
];

const settle = async () => {
  // Wait for execution to catch up with ordering before the next send.
  const before = await pub.getBalance({ address: account.address });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    if ((await pub.getBalance({ address: account.address })) !== before) return;
  }
};

const existing = Number(await pub.readContract({ address: AXON, abi, functionName: "taskCount" }));
const have = [];
for (let i = 0; i < existing; i++) {
  have.push((await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(i)] })).name);
}
console.log(`\n${AXON}\n${existing} task(s) already present\n`);

let added = 0;
for (const [name, slots, reward, scenario, difficulty] of WANTED) {
  if (have.includes(name)) { console.log(`  skip  ${name}`); continue; }
  const value = parseEther(reward) * BigInt(slots);
  const hash = await wallet.writeContract({
    address: AXON, abi, functionName: "createTask",
    args: [name, slots, parseEther(reward), scenario, difficulty], value,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${r.status === "success" ? " ok " : "FAIL"}  ${name} — ${slots} slots, ${formatEther(value)} MON`);
  if (r.status === "success") added++;
  await settle();
}

const total = Number(await pub.readContract({ address: AXON, abi, functionName: "taskCount" }));
console.log(`\n${added} added, ${total} tasks on chain\n`);
process.exit(total === WANTED.length ? 0 : 1);
