/**
 * The core loop, end to end, with nothing mocked: real signed transactions on
 * the Arc fork, Circle's real USDC, the app's real routes.
 *
 *   pnpm e2e:core [baseUrl]          (default http://localhost:9010; the fork app)
 *
 *  1. A fresh operator key is funded from the app's fork faucet (POST /api/localnet/fund)
 *     and admitted to the CorpusShares whitelist by the corpus issuer (a script has no passkey).
 *  2. A recorded run is scored and signed by the verifier (POST /api/verify).
 *  3. One transaction records it and pays the operator in USDC from the task's
 *     escrow (ThenarProtocol.submitTrajectoryFor, sent by the relayer key so the
 *     operator pays no gas): the operator's USDC balance rises by exactly the payout.
 *  4. The app records it (POST /api/submitted).
 *  5. An agent buys that task's corpus over x402 (GET /api/agent/corpus, EIP-3009
 *     USDC settled by the app's in-process facilitator): exactly one cent leaves the
 *     agent, the treasury receives it, SalesLog.saleCount rises by one, and the
 *     sha256 SalesLog records is the sha256 of the bytes received.
 *
 * Every transaction hash is printed. Output is also written to docs/e2e-core.log.
 * Exits non-zero on the first failed check.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, parseAbi, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { AXON_ABI } from "../lib/abi.ts";
import { CORPUS_SHARES_ABI, SALES_LOG_ABI } from "../lib/registry-abi.ts";
import { COHERENT_MM, heldDistanceMm, makeRun } from "./recorded-run.mjs";
import { ADDR, ARC, LOCALNET, appChain, env, need, transport } from "./arc.mjs";

const BASE = (process.argv[2] ?? env("LOCAL_APP_URL") ?? "http://localhost:9010").replace(/\/$/, "");
const lines = [];
const log = (k, v = "") => { const l = `${k.padEnd(10)}${v}`; lines.push(l); console.log(l); };
const save = () => {
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/e2e-core.log", `# pnpm e2e:core, ${new Date().toISOString()}, ${BASE}\n${lines.join("\n")}\n`);
};
function check(ok, what) {
  log(ok ? "  ok" : "  FAIL", what);
  if (!ok) { save(); process.exit(1); }
}

if (!LOCALNET) {
  console.error("  e2e:core runs against the local Arc fork (NEXT_PUBLIC_ARC_NETWORK=fork). It spends real USDC elsewhere.");
  process.exit(1);
}
const PROTOCOL = need(ADDR.protocol, "ThenarProtocol's address (.env.fork)");
const SHARES = need(ADDR.corpusShares, "CorpusShares' address");
const SALES = need(ADDR.salesLog, "SalesLog's address");
const USDC = ARC.usdc;
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const pub = createPublicClient({ chain: appChain, transport: transport(), pollingInterval: 250 });
const walletOf = (key) => createWalletClient({ account: privateKeyToAccount(key), chain: appChain, transport: transport() });
const issuer = walletOf(need(env("CORPUS_ISSUER_PRIVATE_KEY"), "CORPUS_ISSUER_PRIVATE_KEY"));
const relayer = walletOf(need(env("RELAYER_PRIVATE_KEY"), "RELAYER_PRIVATE_KEY"));
const agentKey = need(env("AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY");
const agent = privateKeyToAccount(agentKey);
const AGENT_ID = env("AGENT_ID");
const usdcOf = (a) => pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [a] });
const mined = async (hash, what) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  log("tx", `${what}: ${hash} (block ${r.blockNumber}, ${r.status})`);
  check(r.status === "success", `${what} succeeded`);
  return r;
};

log("e2e:core", `${appChain.name} (${appChain.id}) via ${BASE}; protocol ${PROTOCOL}`);
const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
check(Boolean(health?.checks?.rpc?.ok), `the app answers and reaches the fork (${health?.checks?.rpc?.detail ?? "no answer"})`);

// --- the task: the first that takes a run and can pay one
const count = Number(await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "taskCount" }));
const now = BigInt(Math.floor(Date.now() / 1000));
let TASK = null;
for (let i = 0; i < count && TASK === null; i++) {
  const t = await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "getTask", args: [BigInt(i)] });
  const single = !/ and the /.test(t.name); // one payload: the recorded run carries one object column
  if (single && !t.closed && !t.policyMinted && t.slotsFilled < t.slotsTotal && (t.expiresAt === 0n || t.expiresAt > now) && t.escrow >= t.rewardPerTrajectory) TASK = i;
}
check(TASK !== null, `found a task that takes a run (#${TASK})`);
const taskBefore = await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "getTask", args: [BigInt(TASK)] });

// --- 1. operator: faucet + admission
const op = privateKeyToAccount(generatePrivateKey());
log("operator", op.address);
const fund = await fetch(`${BASE}/api/localnet/fund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: op.address }) }).then((r) => r.json());
check(fund.funded === true && /^0x[0-9a-f]{64}$/i.test(fund.usdc), `the fork faucet sent ${formatUnits(BigInt(fund.amount ?? 0), 6)} USDC`);
log("tx", `faucet transfer: ${fund.usdc}`);
await mined(await issuer.writeContract({ address: SHARES, abi: CORPUS_SHARES_ABI, functionName: "addToControlList", args: [op.address] }), "issuer admits the operator to CorpusShares");

// --- 2. verify
const { run, clamped } = makeRun(Date.now() % 997);
check(clamped === 0 && heldDistanceMm(run.samples) < COHERENT_MM, "the recorded run is coherent (arm and payload describe one event)");
const vres = await fetch(`${BASE}/api/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: TASK, contributor: op.address, ...run }) });
const v = await vres.json();
check(vres.ok && v.accepted === true, `the verifier scored and signed it (${vres.status}: score ${(v.score / 100).toFixed(2)}${v.error ? `, ${v.error}` : ""})`);

// --- 3. one transaction records and pays
const opBefore = await usdcOf(op.address);
const submit = await relayer.writeContract({
  address: PROTOCOL, abi: AXON_ABI, functionName: "submitTrajectoryFor",
  args: [op.address, BigInt(TASK), v.trajHash, v.cid, v.score, v.signature],
});
const rec = await mined(submit, "submitTrajectoryFor (records the run and pays the operator)");
const [accepted] = parseEventLogs({ abi: AXON_ABI, logs: rec.logs, eventName: "TrajectoryAccepted" });
check(Boolean(accepted) && accepted.args.contributor.toLowerCase() === op.address.toLowerCase(), "TrajectoryAccepted names the operator");
const paid = accepted.args.paid;
const opAfter = await usdcOf(op.address);
log("payout", `${formatUnits(paid, 6)} USDC; operator ${formatUnits(opBefore, 6)} -> ${formatUnits(opAfter, 6)} USDC`);
check(paid > 0n && opAfter - opBefore === paid, "the operator's USDC balanceOf rose by exactly the payout, in the same transaction");
const taskAfter = await pub.readContract({ address: PROTOCOL, abi: AXON_ABI, functionName: "getTask", args: [BigInt(TASK)] });
check(taskBefore.escrow - taskAfter.escrow >= paid, `the payout came out of task #${TASK}'s escrow (${formatUnits(taskBefore.escrow, 6)} -> ${formatUnits(taskAfter.escrow, 6)} USDC)`);

// --- 4. the app records it
const sres = await fetch(`${BASE}/api/submitted`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trajHash: v.trajHash, txHash: submit }) });
const s = await sres.json();
check(sres.ok && s.ok === true, `the app recorded the settled run (${sres.status})`);
if (s.shares?.tx) log("tx", `CorpusShares issue: ${s.shares.tx} (${s.shares.units} shares)`);

// --- 5. an agent buys the corpus over x402
const treasury = (await (await fetch(`${BASE}/api/agent/sales`)).json()).terms?.payTo;
check(/^0x[0-9a-fA-F]{40}$/.test(treasury ?? ""), `the corpus treasury is ${treasury}`);
const [agentBefore, treasuryBefore, salesBefore] = await Promise.all([
  usdcOf(agent.address), usdcOf(treasury), pub.readContract({ address: SALES, abi: SALES_LOG_ABI, functionName: "saleCount" }),
]);
const network = `eip155:${appChain.id}`;
const payer = x402Client.fromConfig({
  schemes: [{ network, client: new ExactEvmScheme(toClientEvmSigner(agent, pub)) }],
  spendControls: { allowedAssets: [{ network, asset: USDC, maxAmountPerPayment: "10000" }] },
});
const offer = await fetch(`${BASE}/api/agent/corpus?taskId=${TASK}`, { headers: { accept: "application/json" } });
const terms = await offer.json();
check(offer.status === 402 && terms.accepts?.[0]?.network === network && terms.accepts[0].asset.toLowerCase() === USDC.toLowerCase() && terms.accepts[0].amount === "10000",
  `the unpaid request is a 402 offering 0.01 USDC on ${network}`);
const res = await wrapFetchWithPayment(fetch, payer)(`${BASE}/api/agent/corpus?taskId=${TASK}`, {
  headers: { accept: "application/json", ...(AGENT_ID ? { "x-erc8004-agent-id": AGENT_ID } : {}) },
});
const bytes = Buffer.from(await res.arrayBuffer());
check(res.status === 200, `the paid request returned the corpus (${res.status}${res.ok ? "" : `: ${bytes.toString().slice(0, 200)}`})`);
const settled = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE"));
check(settled.success && /^0x[0-9a-f]{64}$/i.test(settled.transaction), "the x402 payment settled on chain");
await mined(settled.transaction, "x402 settlement (USDC transferWithAuthorization)");
const body = JSON.parse(bytes.toString("utf8"));
check(body.data.some((e) => e.trajectory_hash.toLowerCase() === v.trajHash.toLowerCase()), "the corpus contains the run just paid for");

const [agentAfter, treasuryAfter, salesAfter] = await Promise.all([
  usdcOf(agent.address), usdcOf(treasury), pub.readContract({ address: SALES, abi: SALES_LOG_ABI, functionName: "saleCount" }),
]);
check(agentBefore - agentAfter === 10_000n, `exactly 0.01 USDC left the agent (${formatUnits(agentBefore, 6)} -> ${formatUnits(agentAfter, 6)})`);
check(treasuryAfter - treasuryBefore === 10_000n, "and reached the corpus treasury");
check(salesAfter === salesBefore + 1n, `SalesLog.saleCount ${salesBefore} -> ${salesAfter}`);
const digest = `0x${createHash("sha256").update(bytes).digest("hex")}`;
const sale = await pub.readContract({ address: SALES, abi: SALES_LOG_ABI, functionName: "getSale", args: [salesAfter] });
check(sale.sha256 === digest, `SalesLog #${salesAfter} records the sha256 of the bytes received (${digest.slice(0, 18)}…)`);
check(sale.saleId.toLowerCase() === settled.transaction.toLowerCase() && sale.taskId === BigInt(TASK) && Number(sale.terms) === 0, "keyed by the settlement, for this task, on x402 terms");
log("buyer", sale.buyerAgent === 0n ? "not an ERC-8004 agent" : `ERC-8004 agent #${sale.buyerAgent - 1n}`);
const audit = res.headers.get("x-thenar-audit");
const logTx = (await (await fetch(`${BASE}/api/agent/sales`)).json()).sales.find((x) => x.id.toLowerCase() === settled.transaction.toLowerCase())?.audit?.transaction;
if (logTx) log("tx", `SalesLog.logSale: ${logTx} (${audit})`);

log("PASS", "operator paid in USDC in one transaction; agent bought the corpus over x402; SalesLog agrees");
save();
