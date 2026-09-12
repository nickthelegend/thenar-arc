/**
 * A robotics lab's data budget, held in a Privy wallet that can only fund Thenar.
 *
 * The business case: a lab wants demonstrations recorded and does not want the
 * key that pays for them on anyone's laptop. The budget sits in a Privy server
 * wallet under a Privy policy with one allowed action — a transaction to
 * AxonProtocolV2 on Arc Testnet worth at most one USDC. Posting a bounty is that
 * action. Anything else the wallet is asked to sign, including sending its USDC
 * to an address that is not the protocol, is refused by Privy's policy engine
 * before a signature exists.
 *
 * Privy signs; Arc's RPC broadcasts. Privy will not broadcast on Arc for this app
 * ("App is not authorized to transact on chain eip155:5042002"), but it signs for
 * any chain id, and the policy is enforced at signing — which is where it has to
 * be, because a signature is all anyone needs to spend.
 *
 * Creates the policy and the wallet once (recorded in .env.local), tops the
 * wallet up from the deployer on Arc, posts one bounty through Privy, then asks
 * it to sign something the policy forbids and prints the refusal.
 *
 *   node scripts/privy-lab.mjs ["task name"]
 */
import { appendFileSync, readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, defineChain, encodeFunctionData, formatEther, http, parseAbi, parseEther, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const read = (f) =>
  Object.fromEntries(
    readFileSync(f, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
  );
const local = read(".env.local");
const deployer = read(".env.deployer");
const APP = local.PRIVY_APP_ID;
const SECRET = local.PRIVY_APP_SECRET;
if (!APP || !SECRET) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required in .env.local");

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
});
const AXON = local.NEXT_PUBLIC_AXON_ADDRESS;
/** The most one transaction from the lab's wallet may carry, in USDC wei. */
const LIMIT = parseEther("1");

async function privy(path, body) {
  const res = await fetch(`https://api.privy.io/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Basic ${Buffer.from(`${APP}:${SECRET}`).toString("base64")}`,
      "privy-app-id": APP,
      "content-type": "application/json",
      "user-agent": "thenar-arc/0.1 (+https://github.com/nickthelegend/thenar-arc)",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}

const allowFunding = (method) => ({
  name: `Fund Thenar tasks on Arc (${method})`,
  method,
  action: "ALLOW",
  conditions: [
    { field_source: "ethereum_transaction", field: "to", operator: "eq", value: AXON },
    { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(arc.id) },
    { field_source: "ethereum_transaction", field: "value", operator: "lte", value: LIMIT.toString() },
  ],
});

let policyId = local.PRIVY_LAB_POLICY_ID;
if (!policyId) {
  const r = await privy("/policies", {
    version: "1.0",
    name: "Thenar lab budget: fund tasks on Arc, 1 USDC max",
    chain_type: "ethereum",
    rules: [allowFunding("eth_sendTransaction"), allowFunding("eth_signTransaction")],
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

const pub = createPublicClient({ chain: arc, transport: http() });
const funder = createWalletClient({ account: privateKeyToAccount(deployer.DEPLOYER_PRIVATE_KEY), chain: arc, transport: http() });

let balance = await pub.getBalance({ address: walletAddress });
if (balance < parseEther("0.6")) {
  const h = await funder.sendTransaction({ to: walletAddress, value: parseEther("1.5") });
  await pub.waitForTransactionReceipt({ hash: h });
  balance = await pub.getBalance({ address: walletAddress });
  console.log(`topped   +1.5 USDC from the deployer  https://testnet.arcscan.app/tx/${h}`);
}
console.log(`balance  ${formatEther(balance)} USDC`);

/** A complete EIP-1559 transaction for Privy to sign, priced and nonced from Arc. */
async function prepare(to, value, data) {
  const [nonce, gas, fees] = await Promise.all([
    pub.getTransactionCount({ address: walletAddress, blockTag: "pending" }),
    pub.estimateGas({ account: walletAddress, to, value, data }),
    pub.estimateFeesPerGas(),
  ]);
  return {
    to, value: toHex(value), chain_id: arc.id, nonce, type: 2,
    gas_limit: toHex((gas * 12n) / 10n),
    max_fee_per_gas: toHex(fees.maxFeePerGas),
    max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas),
    ...(data ? { data } : {}),
  };
}

const sign = (transaction) =>
  privy(`/wallets/${walletId}/rpc`, { method: "eth_signTransaction", params: { transaction } });

const abi = parseAbi([
  "function createTaskUntil(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty, uint64 expiresAt) payable returns (uint256)",
  "function taskCount() view returns (uint256)",
]);

const name = process.argv[2] ?? "Lab bounty: steady the crate and place the battery inside";
const slots = 2;
const reward = parseEther("0.2");
const data = encodeFunctionData({
  abi, functionName: "createTaskUntil",
  args: [name, slots, reward, 4, 3, BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)],
});

const before = await pub.readContract({ address: AXON, abi, functionName: "taskCount" });
const signed = await sign(await prepare(AXON, reward * BigInt(slots), data));
if (!signed.ok) {
  console.log(`bounty   Privy refused to sign: ${signed.status} ${JSON.stringify(signed.json)}`);
  process.exit(1);
}
const hash = await pub.sendRawTransaction({ serializedTransaction: signed.json.data.signed_transaction });
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
const after = await pub.readContract({ address: AXON, abi, functionName: "taskCount" });
console.log(`bounty   signed by Privy, ${receipt.status} on Arc; task #${after - 1n} (${before} -> ${after})`);
console.log(`         ${formatEther(reward * BigInt(slots))} USDC escrowed  https://testnet.arcscan.app/tx/${hash}`);

const refused = await sign(await prepare(deployer.DEPLOYER_ADDRESS, parseEther("0.01")));
console.log(`forbid   send 0.01 USDC to the deployer -> ${refused.status} ${JSON.stringify(refused.json)}`);
