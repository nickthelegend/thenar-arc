/**
 * Fund a task with a signature: a sponsor signs Circle USDC's EIP-3009
 * ReceiveWithAuthorization and Thenar's relayer posts it
 * (POST /api/relay/create-task → ThenarProtocol.createTaskWithAuthorization).
 * The sponsor sends no transaction and holds no gas.
 *
 *   NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/relay-task.mjs [baseUrl] [rewardUsdc] [slots] ["name"]
 *
 * Signs with SPONSOR_PRIVATE_KEY (or AGENT_PRIVATE_KEY on the fork). The
 * nonce is read from the protocol (`taskNonce(funder, params)`), so the
 * signature is good for exactly these task parameters.
 */
import { createPublicClient, formatUnits, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AXON_ABI } from "../lib/abi.ts";
import { RECEIVE_WITH_AUTHORIZATION_TYPES, USDC_EIP712_DOMAIN } from "../lib/usdc.ts";
import { ADDR, ARC, LOCALNET, env, appChain, need, transport, txUrl } from "./arc.mjs";

const [baseArg, rewardArg, slotsArg, nameArg] = process.argv.slice(2);
const BASE = baseArg ?? env("LOCAL_APP_URL") ?? "http://localhost:9010";
const PROTOCOL = need(ADDR.protocol, "ThenarProtocol's address");
const key = env("SPONSOR_PRIVATE_KEY") ?? (LOCALNET ? env("AGENT_PRIVATE_KEY") : undefined);
const sponsor = privateKeyToAccount(need(key, "SPONSOR_PRIVATE_KEY"));
const pub = createPublicClient({ chain: appChain, transport: transport() });

const reward = parseUnits(rewardArg ?? "0.02", 6);
const slots = Number(slotsArg ?? 3);
const params = {
  name: nameArg ?? "Put the pen on the closed laptop",
  slots, rewardPerTrajectory: reward, scenario: 2, difficulty: 2,
  expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
  amount: reward * BigInt(slots),
};
const nonce = await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "taskNonce", args: [sponsor.address, params] });
const validAfter = 0n;
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
const signature = await sponsor.signTypedData({
  domain: { ...USDC_EIP712_DOMAIN, chainId: appChain.id, verifyingContract: ARC.usdc },
  types: RECEIVE_WITH_AUTHORIZATION_TYPES,
  primaryType: "ReceiveWithAuthorization",
  message: { from: sponsor.address, to: PROTOCOL, value: params.amount, validAfter, validBefore, nonce },
});
const bal = () => pub.readContract({ address: ARC.usdc, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [sponsor.address] });
const before = await bal();
console.log(`sponsor   ${sponsor.address}  ${formatUnits(before, 6)} USDC; signs ${formatUnits(params.amount, 6)} USDC for ${slots} × ${formatUnits(reward, 6)}`);

const s = (v) => (typeof v === "bigint" ? v.toString() : v);
const res = await fetch(`${BASE}/api/relay/create-task`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    funder: sponsor.address,
    params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? String(v) : s(v)])),
    validAfter: s(validAfter), validBefore: s(validBefore), nonce, signature,
  }),
});
const out = await res.json();
console.log(`relay     ${res.status} ${JSON.stringify(out)}`);
if (!res.ok) process.exit(1);
const after = await bal();
const t = await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "getTask", args: [BigInt(out.taskId)] });
console.log(`task      #${out.taskId} "${t.name}" funder ${t.funder} escrow ${formatUnits(t.escrow, 6)} USDC`);
console.log(`sponsor   ${formatUnits(before, 6)} -> ${formatUnits(after, 6)} USDC (paid no gas: ${before - after === params.amount})`);
console.log(`explorer  ${txUrl(out.transaction)}`);
// A replay of the same signature must be refused.
const again = await fetch(`${BASE}/api/relay/create-task`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ funder: sponsor.address, params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? String(v) : s(v)])), validAfter: s(validAfter), validBefore: s(validBefore), nonce, signature }) });
console.log(`replay    ${again.status} ${(await again.text()).slice(0, 160)}`);
