/**
 * Prove the deferred-payment path on chain.
 *
 * A contributor that refuses transfers still gets recorded and still gets paid
 * — the protocol credits `claimable` rather than reverting the submission.
 *
 *   node scripts/claim.mjs <base-url>
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };

const pub = createPublicClient({ chain, transport: http() });
const owner = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account: owner, chain, transport: http() });

const artifact = JSON.parse(readFileSync("contracts/out/RefusingContributor.sol/RefusingContributor.json", "utf8"));
const refAbi = parseAbi([
  "constructor(address _axon)",
  "function submit(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes sig) returns (uint256)",
  "function acceptAndClaim()",
  "function owed() view returns (uint256)",
]);
const axonAbi = parseAbi([
  "function claimable(address) view returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
]);

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

function makeRun(seed) {
  const hz = 20, secs = 90, n = hz * secs;
  const from = [0.3, 0.2], goal = [0.17, -0.24], out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    out.push({ t: +(i / hz).toFixed(3), q: [0.1*e,0.5*e,0.9*e,0,1.2*e,0], grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [from[0]+(goal[0]-from[0])*e+seed*1e-7, from[1]+(goal[1]-from[1])*e, Math.sin(Math.PI*u)*0.18] });
  }
  out[out.length-1].object = [goal[0]+0.004, goal[1], 0];
  return { samples: out, durationSeconds: secs, deviationMm: 4.0, success: true };
}

console.log(`\nDeferred payment · ${BASE}\n`);

const deployHash = await wallet.deployContract({ abi: refAbi, bytecode: artifact.bytecode.object, args: [env.AXON_ADDRESS] });
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const ref = deployed.contractAddress;
check(deployed.status === "success", "refusing contributor deployed", ref);

const TASK_ID = Number(process.env.TASK_ID ?? 7);
const task = await pub.readContract({ address: env.AXON_ADDRESS, abi: axonAbi, functionName: "getTask", args: [BigInt(TASK_ID)] });
console.log(`  task #${TASK_ID} "${task.name}", ${task.slotsFilled}/${task.slotsTotal} filled\n`);

// The verifier signs for whoever will call — here, the contract.
const res = await fetch(`${BASE}/api/verify`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ taskId: TASK_ID, contributor: ref, ...makeRun(Date.now()) }),
});
const v = await res.json();
check(res.ok, "verifier signed for the contract address", res.ok ? `score ${(v.score/100).toFixed(2)}` : v.error);
if (!res.ok) process.exit(1);

const h = await wallet.writeContract({ address: ref, abi: refAbi, functionName: "submit",
  args: [BigInt(TASK_ID), v.trajHash, v.cid, v.score, v.signature] });
const r = await pub.waitForTransactionReceipt({ hash: h });
check(r.status === "success", "submission succeeded even though the payee refuses transfers", h.slice(0, 20));

// Any run that reaches the chain has to carry its transaction in the store,
// or the feed and the dataset export will report it as never submitted.
await fetch(`${BASE}/api/submitted`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ trajHash: v.trajHash, txHash: h }),
});
const linked = await (await fetch(`${BASE}/api/trajectory/${v.trajHash}`)).json();
check(linked.txHash === h, "transaction linked to the stored trajectory");

const bal = await pub.getBalance({ address: ref });
const owed = await pub.readContract({ address: env.AXON_ADDRESS, abi: axonAbi, functionName: "claimable", args: [ref] });
check(bal === 0n, "the push was refused, so nothing landed", `${formatEther(bal)} MON`);
check(owed > 0n, "the protocol credited it instead of reverting", `${formatEther(owed)} MON owed`);

const c = await wallet.writeContract({ address: ref, abi: refAbi, functionName: "acceptAndClaim" });
const cr = await pub.waitForTransactionReceipt({ hash: c });
check(cr.status === "success", "claim() pulled the balance once it stopped refusing", c.slice(0, 20));

const after = await pub.getBalance({ address: ref });
const stillOwed = await pub.readContract({ address: env.AXON_ADDRESS, abi: axonAbi, functionName: "claimable", args: [ref] });
check(after === owed, "the contract now holds exactly what it was owed", `${formatEther(after)} MON`);
check(stillOwed === 0n, "the credit is cleared");

console.log(failed === 0 ? "\ndeferred payment proven on chain\n" : `\n${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
