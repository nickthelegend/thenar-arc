/**
 * One real paid run on Arc: scored and signed by the verifier, submitted by a
 * fresh operator, and paid in USDC by the transaction that records it.
 *
 * The operator is a new key every time, so a run is never submitted by the
 * address that funded the task. A script has no passkey, so the corpus issuer
 * key admits it to the CorpusShares whitelist directly (the verifier refuses
 * anyone not on it), and the faucet (fork) or deployer (testnet) sends it a
 * few cents of USDC for gas. On Arc the gas is the same USDC it is paid in, so
 * its balance rises by the payout less the gas.
 *
 * `--memo` routes the submit through Arc's Memo, tagged with the run id
 * (memoId = trajHash), where the node executes CallFrom; on a fork it is
 * probed, found absent, and the run goes out plain.
 *
 * A script, not a person at the station, and it says so wherever its runs are
 * shown.
 *
 *   NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/arc-run.mjs [baseUrl] [taskId] [seed] [--memo]
 */
import { createPublicClient, createWalletClient, formatUnits, parseAbi, parseEventLogs, encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { COHERENT_MM, heldDistanceMm, makeRun } from "./recorded-run.mjs";
import { memoProbeCall, probeRevertProvesCallFrom, revertDataOf, wrapInMemo, runMemoLine } from "../lib/memo.ts";
import { AXON_ABI } from "../lib/abi.ts";
import { CORPUS_SHARES_ABI } from "../lib/registry-abi.ts";
import { ADDR, ARC, LOCALNET, env, appChain, need, transport, txUrl } from "./arc.mjs";

const argv = process.argv.slice(2);
const MEMO = argv.includes("--memo");
const pos = argv.filter((a) => !a.startsWith("--"));
const BASE = pos[0] ?? env("LOCAL_APP_URL") ?? "http://localhost:9010";
const SEED = Number(pos[2] ?? Date.now() % 1000);

const AXON = need(ADDR.protocol, "ThenarProtocol's address (deploy, then scripts/apply-deploy.mjs; on the fork, .env.fork)");
const SHARES = need(ADDR.corpusShares, "CorpusShares' address");
const ISSUER_KEY = need(env("CORPUS_ISSUER_PRIVATE_KEY"), "CORPUS_ISSUER_PRIVATE_KEY (admits the script's operator)");
const FUNDER_KEY = need(LOCALNET ? env("LOCAL_FAUCET_PRIVATE_KEY") : env("ARC_RUN_FUNDER_PRIVATE_KEY") ?? env("DEPLOYER_PRIVATE_KEY"),
  LOCALNET ? "LOCAL_FAUCET_PRIVATE_KEY (.env.fork)" : "ARC_RUN_FUNDER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY (sends the operator gas USDC)");
const USDC = ARC.usdc;
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
]);
/** Gas money for the operator: 5 cents of USDC covers a submit many times over on Arc. */
const GAS_DRIP = 50_000n;

const pub = createPublicClient({ chain: appChain, transport: transport() });
const wallet = (key) => createWalletClient({ account: privateKeyToAccount(key), chain: appChain, transport: transport() });
const issuer = wallet(ISSUER_KEY);
const funder = wallet(FUNDER_KEY);
const opKey = generatePrivateKey();
const op = privateKeyToAccount(opKey);
const operator = wallet(opKey);

/** The task to run: the one named, or the first that takes runs now and can pay one. */
async function pickTask() {
  if (pos[1] !== undefined) return Number(pos[1]);
  const n = Number(await pub.readContract({ address: AXON, abi: AXON_ABI, functionName: "taskCount" }));
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (let i = 0; i < n; i += 1) {
    const t = await pub.readContract({ address: AXON, abi: AXON_ABI, functionName: "getTask", args: [BigInt(i)] });
    const open = !t.closed && !t.policyMinted && t.slotsFilled < t.slotsTotal && (t.expiresAt === 0n || t.expiresAt > now);
    if (open && t.escrow >= t.rewardPerTrajectory) return i;
  }
  console.log("no task takes runs now; post one first");
  process.exit(1);
}
const TASK = await pickTask();
console.log(`network   ${appChain.name} (${appChain.id})  task #${TASK}  seed ${SEED}  operator ${op.address}`);

const { run, clamped } = makeRun(SEED);
const heldMm = heldDistanceMm(run.samples);
console.log(`arm       tool ${heldMm.toFixed(1)} mm from the payload while holding it; ${clamped} frames clamped`);
if (!(heldMm < COHERENT_MM) || clamped > 0) {
  console.log("refused   by this script: the arm and the payload would not describe the same event");
  process.exit(1);
}

// A script has no passkey: the issuer admits it to the whitelist the verifier checks.
const admit = await issuer.writeContract({ address: SHARES, abi: CORPUS_SHARES_ABI, functionName: "addToControlList", args: [op.address] });
await pub.waitForTransactionReceipt({ hash: admit });
console.log(`admitted  by the corpus issuer (script run, no passkey)  ${txUrl(admit)}`);

const res = await fetch(`${BASE}/api/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ taskId: TASK, contributor: op.address, ...run }),
});
const v = await res.json();
if (!res.ok) {
  console.log(`refused   ${res.status}: ${v.error}`);
  process.exit(1);
}
const reward = BigInt(v.reward ?? v.rewardWei);
console.log(`verified  score ${(v.score / 100).toFixed(2)}  accepted ${v.accepted}  pays up to ${formatUnits(reward, 6)} USDC`);
if (!v.accepted) process.exit(1);

const fund = await funder.writeContract({ address: USDC, abi: ERC20, functionName: "transfer", args: [op.address, GAS_DRIP] });
await pub.waitForTransactionReceipt({ hash: fund });
const before = await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [op.address] });

const data = encodeFunctionData({ abi: AXON_ABI, functionName: "submitTrajectory", args: [BigInt(TASK), v.trajHash, v.cid, v.score, v.signature] });
let to = AXON;
let sendData = data;
let tagged = false;
if (MEMO) {
  const probe = memoProbeCall(USDC, ARC.memo);
  tagged = await pub.call({ account: probe.from, to: probe.to, data: probe.data }).then(() => false, (e) => probeRevertProvesCallFrom(revertDataOf(e)));
  if (tagged) {
    ({ to, data: sendData } = wrapInMemo({ memo: ARC.memo, target: AXON, data, memoId: v.trajHash, line: runMemoLine(TASK, v.score) }));
  }
  console.log(`memo      ${tagged ? `live: the submit goes through Memo ${ARC.memo}, memoId = the run id` : "CallFrom is not executed by this node: sent plain"}`);
}

// The node estimates the gas: a submit carries the ERC-8004 verdict write, and too little gas for it reverts.
const hash = await operator.sendTransaction({ to, data: sendData });
const t0 = Date.now();
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(`submitted ${receipt.status} in block ${receipt.blockNumber} after ${Date.now() - t0} ms (final on inclusion)`);
if (receipt.status !== "success") process.exit(1);

const [accepted] = parseEventLogs({ abi: AXON_ABI, logs: receipt.logs, eventName: "TrajectoryAccepted" });
const after = await pub.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [op.address] });
const gasUnits = (receipt.gasUsed * receipt.effectiveGasPrice) / 10n ** 12n;
console.log(`paid      ${formatUnits(accepted.args.paid, 6)} USDC in that transaction; gas ${formatUnits(gasUnits, 6)} USDC`);
console.log(`balance   ${formatUnits(before, 6)} -> ${formatUnits(after, 6)} USDC (${after > before ? "+" : ""}${formatUnits(after - before, 6)}: the payout less the gas, both in USDC)`);

const s = await fetch(`${BASE}/api/submitted`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ trajHash: v.trajHash, txHash: hash }),
});
console.log(`recorded  ${s.status} ${JSON.stringify(await s.json()).slice(0, 300)}`);
console.log(`explorer  ${txUrl(hash)}`);
