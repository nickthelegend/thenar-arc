/**
 * A robotics lab's data budget, held in a Privy wallet that can only fund Thenar.
 *
 * The business case: a lab wants demonstrations recorded and does not want the
 * key that pays for them on anyone's laptop. The budget sits in a Privy server
 * wallet under a Privy policy that allows, on Arc and with no native value:
 *  - USDC.approve(ThenarProtocol, amount ≤ 10 USDC) (lib/server/privy-lab.ts LAB_LIMIT);
 *  - ThenarProtocol.createTaskUntil(…, amount ≤ 10 USDC), which pulls that approval into escrow;
 *  - ThenarProtocol.closeTask, which returns unspent escrow to the funder (the lab).
 * Anything else the wallet is asked to sign — a USDC transfer anywhere, an
 * approval of another spender — is refused by Privy's policy engine before a
 * signature exists. On Arc the budget and its gas are the same USDC.
 *
 * Creates the policy and the wallet once (recorded in .env.local), tops the
 * wallet up with USDC from the deployer, posts one bounty through Privy, then
 * asks it to sign something the policy forbids and prints the refusal.
 *
 *   node --import ./test/register.mjs scripts/privy-lab.mjs ["task name"]
 *
 * Testnet or mainnet only: Privy signs for Arc's chain id and the transaction
 * is broadcast through this script's RPC, but a fork has no lab wallet funding.
 */
import { appendFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeFunctionData, formatUnits, parseAbi, parseEventLogs, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDR, ARC, appChain, need, readEnvFile, transport, txUrl } from "./arc.mjs";

const local = readEnvFile(".env.local");
const deployer = readEnvFile(".env.deployer");
const APP = local.PRIVY_APP_ID;
const SECRET = local.PRIVY_APP_SECRET;
if (!APP || !SECRET) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required in .env.local");

const PROTOCOL = need(ADDR.protocol, "ThenarProtocol's address (deploy, then scripts/apply-deploy.mjs)");
const USDC = ARC.usdc;
/** The most one approval or one bounty may be, USDC base units. Mirrors LAB_LIMIT in lib/server/privy-lab.ts. */
const LIMIT = 10_000_000n;

const ERC20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const PROTOCOL_ABI = parseAbi([
  "function createTaskUntil(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty, uint64 expiresAt, uint256 amount) returns (uint256)",
  "function closeTask(uint256 taskId) returns (uint256)",
  "event TaskCreated(uint256 indexed taskId, address indexed funder, string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty)",
]);
const abiJson = (abi, name) => abi.filter((x) => x.type === "function" && x.name === name);

async function privy(path, body) {
  const res = await fetch(`https://api.privy.io/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Basic ${Buffer.from(`${APP}:${SECRET}`).toString("base64")}`,
      "privy-app-id": APP,
      "content-type": "application/json",
      "user-agent": "thenar-arc/0.1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}

const tx = (field, operator, value) => ({ field_source: "ethereum_transaction", field, operator, value });
const call = (abi, field, operator, value) => ({ field_source: "ethereum_calldata", field, abi, operator, value });
const onArc = [tx("chain_id", "eq", String(appChain.id)), tx("value", "eq", "0")];
const rules = (method) => [
  {
    name: `Approve Thenar, 10 USDC max (${method})`, method, action: "ALLOW",
    conditions: [...onArc, tx("to", "eq", USDC),
      call(abiJson(ERC20, "approve"), "approve.spender", "eq", PROTOCOL),
      call(abiJson(ERC20, "approve"), "approve.amount", "lte", LIMIT.toString())],
  },
  {
    name: `Post a Thenar bounty (${method})`, method, action: "ALLOW",
    conditions: [...onArc, tx("to", "eq", PROTOCOL),
      call(abiJson(PROTOCOL_ABI, "createTaskUntil"), "createTaskUntil.amount", "lte", LIMIT.toString())],
  },
  {
    name: `Close a Thenar bounty (${method})`, method, action: "ALLOW",
    conditions: [...onArc, tx("to", "eq", PROTOCOL),
      call(abiJson(PROTOCOL_ABI, "closeTask"), "closeTask.taskId", "gte", "0")],
  },
];

let policyId = local.PRIVY_LAB_POLICY_ID;
if (!policyId) {
  const r = await privy("/policies", {
    version: "1.0",
    // Privy refuses a policy name of 50 characters or more.
    name: "Thenar lab: fund Arc tasks, 10 USDC max",
    chain_type: "ethereum",
    rules: [...rules("eth_sendTransaction"), ...rules("eth_signTransaction")],
  });
  if (!r.ok) {
    console.log(`policy   refused ${r.status} ${JSON.stringify(r.json)}`);
    process.exit(1);
  }
  policyId = r.json.id;
  appendFileSync(".env.local", `PRIVY_LAB_POLICY_ID=${policyId}\n`);
  console.log(`policy   ${policyId}`);
} else {
  console.log(`policy   ${policyId}  already recorded`);
}

let walletId = local.PRIVY_LAB_WALLET_ID;
let walletAddress = local.PRIVY_LAB_WALLET_ADDRESS;
if (!walletId) {
  const r = await privy("/wallets", { chain_type: "ethereum", policy_ids: [policyId] });
  if (!r.ok) {
    console.log(`wallet   refused ${r.status} ${JSON.stringify(r.json)}`);
    process.exit(1);
  }
  walletId = r.json.id;
  walletAddress = r.json.address;
  appendFileSync(".env.local", `PRIVY_LAB_WALLET_ID=${walletId}\nPRIVY_LAB_WALLET_ADDRESS=${walletAddress}\n`);
  console.log(`wallet   ${walletId}  ${walletAddress}`);
} else {
  console.log(`wallet   ${walletId}  ${walletAddress}  already recorded`);
}

const pub = createPublicClient({ chain: appChain, transport: transport() });
const usdcOf = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });

let balance = await usdcOf(walletAddress);
if (balance < 200_000n && deployer.DEPLOYER_PRIVATE_KEY) {
  const funder = createWalletClient({ account: privateKeyToAccount(deployer.DEPLOYER_PRIVATE_KEY), chain: appChain, transport: transport() });
  const h = await funder.writeContract({ address: USDC, abi: ERC20, functionName: "transfer", args: [walletAddress, 500_000n] });
  await pub.waitForTransactionReceipt({ hash: h });
  balance = await usdcOf(walletAddress);
  console.log(`topped   +0.5 USDC from the deployer  ${txUrl(h)}`);
}
console.log(`balance  ${formatUnits(balance, 6)} USDC (the budget and its gas)`);

/** A complete EIP-1559 transaction for Privy to sign, priced and nonced from Arc. Never carries native value. */
async function prepare(to, data) {
  const [nonce, gas, fees] = await Promise.all([
    pub.getTransactionCount({ address: walletAddress, blockTag: "pending" }),
    pub.estimateGas({ account: walletAddress, to, data }),
    pub.estimateFeesPerGas(),
  ]);
  return {
    to, value: "0x0", chain_id: appChain.id, nonce, type: 2,
    gas_limit: toHex((gas * 12n) / 10n),
    max_fee_per_gas: toHex(fees.maxFeePerGas),
    max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas),
    data,
  };
}
const sign = (transaction) => privy(`/wallets/${walletId}/rpc`, { method: "eth_signTransaction", params: { transaction } });
async function send(to, data, what) {
  const signed = await sign(await prepare(to, data));
  if (!signed.ok) {
    console.log(`${what.padEnd(8)} Privy refused to sign: ${signed.status} ${JSON.stringify(signed.json)}`);
    process.exit(1);
  }
  const hash = await pub.sendRawTransaction({ serializedTransaction: signed.json.data.signed_transaction });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  console.log(`${what.padEnd(8)} signed by Privy, ${receipt.status} on ${appChain.name}  ${txUrl(hash)}`);
  return receipt;
}

const name = process.argv[2] ?? "Lab bounty: steady the crate and place the battery inside";
const slots = 2;
const reward = 40_000n; // 0.04 USDC a run
const amount = reward * BigInt(slots);
const allowance = await pub.readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [walletAddress, PROTOCOL] });
if (allowance < amount) {
  await send(USDC, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [PROTOCOL, amount] }), "approve");
}
const receipt = await send(PROTOCOL, encodeFunctionData({
  abi: PROTOCOL_ABI, functionName: "createTaskUntil",
  args: [name, slots, reward, 4, 3, BigInt(Math.floor(Date.now() / 1000) + 7 * 86400), amount],
}), "bounty");
const [created] = parseEventLogs({ abi: PROTOCOL_ABI, logs: receipt.logs, eventName: "TaskCreated" });
console.log(`         task #${created?.args.taskId}: ${formatUnits(amount, 6)} USDC escrowed`);

const refused = await sign(await prepare(USDC, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [deployer.DEPLOYER_ADDRESS ?? PROTOCOL, 10_000n] })));
console.log(`forbid   transfer 0.01 USDC out of the budget -> ${refused.status} ${JSON.stringify(refused.json)}`);
