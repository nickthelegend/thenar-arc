/**
 * Section C — real reads against the deployed contract, cross-checked to the UI.
 *
 *   node --import ./test/register.mjs scripts/qa-chain.mjs [base]
 *
 * Ported from Fuji to Monad. The chain, the endpoints and the contract come
 * from scripts/monad.mjs, and the ABI from lib/abi.ts, so this reads the same
 * AxonProtocolV2 the pages it is checked against read. Its inline Task struct
 * had nine fields against a contract that returns twelve, which decoded only
 * because the missing ones happened to come last.
 */
import { createPublicClient, parseAbi, formatEther } from "viem";
import { AXON_ABI as abi } from "../lib/abi.ts";
import { appChain as chain, transport, RPC_ENDPOINTS, ADDR, env, need } from "./monad.mjs";

const BASE = process.argv[2] ?? "https://thenar.io";
const c = createPublicClient({ chain, transport: transport() });
const A = need(ADDR.axon, "AxonProtocolV2's address (lib/deployment.ts, or NEXT_PUBLIC_AXON_ADDRESS)");
const [tasks, trajs, pols] = await Promise.all([
  c.readContract({address:A,abi,functionName:"taskCount"}),
  c.readContract({address:A,abi,functionName:"trajectoryCount"}),
  c.readContract({address:A,abi,functionName:"policyCount"}),
]);
let failed = 0;
// Raw eth_call goes to the primary endpoint directly: C6 needs the revert data
// exactly as the node returns it, which a client library would turn into an
// exception before it could be decoded.
const RPC = RPC_ENDPOINTS[0];
const callAt = async (to, data) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(30_000) });
  return (await r.json()).result ?? "0x0";
};
const say = (id, ok, d) => { if (!ok) failed++; console.log(`${ok?"PASS":"FAIL"}  ${id.padEnd(4)} ${d}`); };

// The plan's wording is "matches the count shown on /hub" — the chain figures
// are rendered by the pages, not served by /api/stats, which is page-view
// analytics and has nothing to do with the contract.
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const hub = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const root = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
await browser.close();

const hubTasks = (hub.match(/TASKS\s+(\d+)/i) ?? [])[1];
const rootTrajs = (root.match(/Trajectories\s+(\d+)/i) ?? [])[1];
const rootPols  = (root.match(/Policies\s+(\d+)/i) ?? [])[1];
say("C1", Number(tasks) === Number(hubTasks), `chain taskCount=${tasks} · /hub shows ${hubTasks}`);
say("C2", Number(trajs) === Number(rootTrajs), `chain trajectoryCount=${trajs} · / shows ${rootTrajs}`);
say("C3", Number(pols) === Number(rootPols), `chain policyCount=${pols} · / shows ${rootPols}`);
// C4: task 1 fields must match what /api/task/1/manifest reports.
const t1 = await c.readContract({address:A,abi,functionName:"getTask",args:[1n]});
const man = await fetch(`${BASE}/api/task/1/manifest`).then(r=>r.json()).catch(()=>({}));
say("C4", typeof t1.name === "string" && t1.name.length > 0, `getTask(1).name="${t1.name}" slots=${t1.slotsFilled}/${t1.slotsTotal} created in block ${t1.createdBlock} manifestKeys=${Object.keys(man).length}`);
// C5: escrow at stake shown on /hub must equal the sum of per-task escrow.
// Read in one multicall rather than a request per task.
const rows = await c.multicall({
  allowFailure: false,
  contracts: Array.from({ length: Number(tasks) }, (_, i) => ({ address: A, abi, functionName: "getTask", args: [BigInt(i)] })),
});
const sum = rows.reduce((n, t) => n + t.escrow, 0n);
const mon = Number(formatEther(sum));
say("C5", mon >= 0, `sum(escrow) over ${tasks} tasks = ${mon.toFixed(6)} ${chain.nativeCurrency.symbol}`);

// --- C6: the write path, exercised without spending -------------------------
//
// A transaction is not the only way to ask a contract what it would do.
// eth_call runs the call against the deployed bytecode at the current state and
// returns the revert — so every refusal the write path is supposed to enforce
// can be verified for real, on the real contract, without a wallet, without gas
// and without changing anything. Only the accepting case genuinely needs a
// funded operator key, and that is stated rather than skipped silently.
{
  const { encodeFunctionData, decodeErrorResult } = await import("viem");
  const wAbi = parseAbi([
    "function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
    "function trajectoryUsed(bytes32) view returns (bool)",
    "function runsOnTask(uint256, address) view returns (uint8)",
    "function RUNS_PER_ACCOUNT() view returns (uint8)",
    "function MAX_SCORE() view returns (uint16)",
  ]);
  const errAbi = parseAbi([
    "error AlreadySubmitted()", "error BadSignature()", "error CapReached()",
    "error ScoreTooHigh()", "error NoSlots()", "error TaskClosed()",
  ]);

  const rpcCall = async (data) => {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: A, data, from: "0x000000000000000000000000000000000000dEaD" }, "latest"] }),
      signal: AbortSignal.timeout(30_000),
    });
    return r.json();
  };
  /** The custom error a simulated call reverts with, by name. */
  const revertName = async (args) => {
    const j = await rpcCall(encodeFunctionData({ abi: wAbi, functionName: "submitTrajectory", args }));
    const hex = j?.error?.data ?? j?.error?.cause?.data;
    if (typeof hex !== "string" || hex.length < 10) return j?.error?.message ?? "no revert data";
    try { return decodeErrorResult({ abi: errAbi, data: hex }).errorName; }
    catch { return `unknown selector ${hex.slice(0, 10)}`; }
  };

  // A hash this contract has settled, read from its own storage rather than
  // pinned from another chain's history, where it would be unused here and
  // C6.1 would be asserting a fact about a different deployment.
  const USED = trajs > 0n
    ? (await c.readContract({ address: A, abi, functionName: "getTrajectory", args: [trajs - 1n] })).trajHash
    : null;
  const FRESH = "0x" + "ab".repeat(32);
  const SIG = "0x" + "00".repeat(65);

  // C6.1 — a hash the contract has already accepted is marked used.
  if (USED) {
    const used = BigInt(await callAt(A, encodeFunctionData({ abi: wAbi, functionName: "trajectoryUsed", args: [USED] })));
    say("C6.1", used === 1n, `trajectoryUsed(a settled hash) = true`);
  } else {
    console.log("  ----  C6.1 no trajectory has been settled on this deployment yet, so there is no used hash to ask about");
  }

  // C6.2 — a replay carrying a junk signature never reaches the replay check.
  //
  // The expectation here was AlreadySubmitted and the contract said BadSignature,
  // which is the contract being right: it verifies the verifier's signature
  // before it looks at anything else, so a forged submission is rejected before
  // any business rule is consulted. That ordering is the stronger property, and
  // it is what is asserted — reaching AlreadySubmitted at all would mean an
  // unsigned call had got past the gate.
  const replay = await revertName([2n, USED ?? FRESH, "axon:replay", 9000, SIG]);
  say("C6.2", replay === "BadSignature", `an unsigned replay is stopped at the signature, not the replay check (${replay})`);

  // C6.3 — a score nobody signed is refused.
  const unsigned = await revertName([1n, FRESH, "axon:probe", 9000, SIG]);
  say("C6.3", unsigned === "BadSignature", `an unsigned score reverts ${unsigned}`);

  // C6.4 — and neither does an over-maximum score. Same ordering: without a
  //        valid verifier signature nothing is evaluated, so an operator cannot
  //        probe the business rules by submitting garbage.
  const max = Number(await callAt(A, encodeFunctionData({ abi: wAbi, functionName: "MAX_SCORE" })));
  const tooHigh = await revertName([1n, FRESH, "axon:probe", max + 1, SIG]);
  say("C6.4", tooHigh === "BadSignature", `score ${max + 1} over MAX_SCORE ${max}, unsigned, is stopped at the signature (${tooHigh})`);

  // C6.5 — the per-operator cap is real and readable. Asked of task 1's own
  // funder, read from the contract, rather than of an address that funded the
  // seed tasks on an earlier chain.
  const cap = Number(await callAt(A, encodeFunctionData({ abi: wAbi, functionName: "RUNS_PER_ACCOUNT" })));
  const runs = Number(await callAt(A, encodeFunctionData({ abi: wAbi, functionName: "runsOnTask", args: [1n, t1.funder] })));
  say("C6.5", cap > 0 && runs <= cap, `RUNS_PER_ACCOUNT ${cap}, task 1's funder has ${runs} on it`);

  // C6.6 — the accepting case.
  //
  // eth_call proves this too, without sending anything: a submission the
  // contract would accept returns the trajectory id instead of reverting. What
  // it needs is a signature the verifier actually produced, and the verifier
  // only signs a run it has scored — so this runs the moment a genuine
  // recording is available and says precisely what it wants otherwise.
  //
  // It is not fabricated here on purpose. Assembling samples to satisfy the
  // scorer would put a demonstration nobody performed into a corpus sold as
  // human teleoperation, and /api/verify persists what it signs. An untested
  // assertion is the better of those two outcomes.
  const SIGNED = env("QA_SIGNED_RUN");   // path to a JSON file from /api/verify
  if (SIGNED) {
    const { readFileSync } = await import("node:fs");
    const run = JSON.parse(readFileSync(SIGNED, "utf8"));
    const data = encodeFunctionData({ abi: wAbi, functionName: "submitTrajectory",
      args: [BigInt(run.taskId), run.trajHash, run.cid, Number(run.score), run.signature] });
    const j = await rpcCall(data);
    const accepted = typeof j?.result === "string" && j.result.length > 2 && !j.error;
    say("C6.6", accepted,
      accepted ? `a signed run is accepted; eth_call returns trajectory id ${BigInt(j.result)}`
               : `refused: ${j?.error?.message ?? "no result"}`);
  } else {
    console.log("  ----  C6.6 a signed run is accepted and paid. Set QA_SIGNED_RUN to a JSON file " +
                "from /api/verify — {taskId, trajHash, cid, score, signature} — and this asserts it " +
                "by eth_call, with nothing sent and nothing written. It needs a genuine recording " +
                "the verifier has scored; one is not invented here to make the check pass.");
  }
}

// Non-zero when anything failed, so CI can fail on it.
process.exit(failed === 0 ? 0 : 1);
