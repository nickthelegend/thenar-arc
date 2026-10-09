/**
 * Close lab bounties past their deadline, and take their escrow back.
 *
 *   node --import ./test/register.mjs scripts/close-lab-tasks.mjs 7 8 9 10
 *   node --import ./test/register.mjs scripts/close-lab-tasks.mjs --check 7 8 9 10
 *
 * The lab's budget is a Privy server wallet whose policy (scripts/privy-lab.mjs)
 * allows a USDC approval of ThenarProtocol up to a cap, ThenarProtocol's
 * createTaskUntil, and closeTask — all on Arc, carrying no native value.
 * closeTask returns the escrow to its funder (the lab wallet) and nobody else;
 * this broadcasts it and waits for Arc's receipt (final on inclusion).
 *
 * Each id is read from the contract first and skipped, with the reason, unless
 * the lab wallet funded it, it is still open, and its deadline has passed —
 * ThenarProtocol refuses anything else with NotExpired or NotFunder, and there
 * is no reason to spend gas learning that. --check reads and reports only.
 */
import {
  createPublicClient, encodeFunctionData, formatUnits, parseAbi, toHex,
} from "viem";
import { ADDR, appChain, need, readEnvFile, transport, txUrl } from "./arc.mjs";

const local = readEnvFile(".env.local");
const APP = need(local.PRIVY_APP_ID, "PRIVY_APP_ID");
const SECRET = need(local.PRIVY_APP_SECRET, "PRIVY_APP_SECRET");
const WALLET_ID = need(local.PRIVY_LAB_WALLET_ID, "PRIVY_LAB_WALLET_ID");
const LAB = need(local.PRIVY_LAB_WALLET_ADDRESS, "PRIVY_LAB_WALLET_ADDRESS");
const AXON = need(ADDR.protocol, "ThenarProtocol's address");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!ids.length) need(null, "at least one task id");

const pub = createPublicClient({ chain: appChain, transport: transport() });
const abi = parseAbi([
  "function closeTask(uint256 taskId) returns (uint256 refunded)",
  "function getTask(uint256 taskId) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted, uint64 expiresAt, bool closed, uint64 createdBlock))",
  "event TaskExpired(uint256 indexed taskId, address indexed funder, uint256 refunded)",
]);

async function privy(path, body) {
  const res = await fetch(`https://api.privy.io/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${APP}:${SECRET}`).toString("base64")}`,
      "privy-app-id": APP,
      "content-type": "application/json",
      "user-agent": "thenar-arc/0.1",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}

const head = await pub.getBlock();
const now = Number(head.timestamp);
let failures = 0;

for (const id of ids) {
  const t = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(id)] });
  const label = `#${id} "${t.name.slice(0, 48)}"`;
  const expires = Number(t.expiresAt);
  const reason =
    t.funder.toLowerCase() !== LAB.toLowerCase() ? `funded by ${t.funder}, not the lab wallet`
    : t.closed ? "already closed"
    : expires === 0 ? "has no deadline, so it can never be closed"
    : now <= expires ? `expires ${new Date(expires * 1000).toISOString()}, chain time is ${new Date(now * 1000).toISOString()}`
    : null;
  if (reason) {
    console.log(`skip  ${label}: ${reason}`);
    continue;
  }
  if (checkOnly) {
    console.log(`ready ${label}: ${formatUnits(t.escrow, 6)} USDC would come back`);
    continue;
  }

  const data = encodeFunctionData({ abi, functionName: "closeTask", args: [BigInt(id)] });
  const [nonce, gas, fees] = await Promise.all([
    pub.getTransactionCount({ address: LAB, blockTag: "pending" }),
    pub.estimateGas({ account: LAB, to: AXON, data }),
    pub.estimateFeesPerGas(),
  ]);
  const signed = await privy(`/wallets/${WALLET_ID}/rpc`, {
    method: "eth_signTransaction",
    params: {
      transaction: {
        to: AXON, value: toHex(0n), chain_id: appChain.id, nonce, type: 2,
        gas_limit: toHex((gas * 12n) / 10n),
        max_fee_per_gas: toHex(fees.maxFeePerGas),
        max_priority_fee_per_gas: toHex(fees.maxPriorityFeePerGas),
        data,
      },
    },
  });
  if (!signed.ok) {
    console.log(`FAIL  ${label}: Privy refused to sign — ${signed.status} ${JSON.stringify(signed.json)}`);
    failures += 1;
    continue;
  }
  const hash = await pub.sendRawTransaction({ serializedTransaction: signed.json.data.signed_transaction });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") {
    console.log(`FAIL  ${label}: reverted ${txUrl(hash)}`);
    failures += 1;
    continue;
  }
  const after = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(id)] });
  console.log(`closed ${label}: ${formatUnits(t.escrow, 6)} USDC back to the lab, closed=${after.closed}  ${txUrl(hash)}`);
}

process.exit(failures ? 1 : 0);
