/**
 * One real run on Monad: scored and signed by the verifier, submitted by a
 * fresh operator, and paid in MON by the transaction that records it.
 *
 * Descended from the Blitz-era e2e and fill-one scripts. The operator is a new key
 * every time, so a run is never submitted by the address that funded the task,
 * and it is funded only after the verifier has accepted its run — a refused run
 * costs nothing.
 *
 * A script, not a person at the station, and it says so wherever its runs are
 * shown. What it does not do is what the Blitz-era scripts did: ramp the joints
 * linearly while the payload moved on its own, which put runs on the ledger
 * whose arm was nowhere near the thing it was holding.
 *
 * Monad charges the gas limit, so the submit's limit is the estimate plus a
 * tenth, and the operator is funded with what that costs rather than a round
 * number.
 *
 *   node --import ./test/register.mjs scripts/monad-run.mjs [baseUrl] [taskId] [seed]
 */
import {
  createPublicClient, createWalletClient, formatEther, parseAbi, parseEventLogs,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { solve, toolPosition } from "../lib/kinematics.ts";
import { ADDR, env, appChain, need, transport, txUrl } from "./monad.mjs";

const BASE = process.argv[2] ?? "http://localhost:3222";
const TASK = Number(process.argv[3] ?? "1");
const SEED = Number(process.argv[4] ?? Date.now() % 1000);

/** From lib/coherence.ts: jaws below this opening are holding something, in mm. */
const GRIP_CLOSED_MM = 14;
/** From lib/coherence.ts: a held payload further than this from the tool is not held. */
const COHERENT_MM = 60;

const AXON = need(ADDR.axon, "AxonProtocolV2's address (deploy, then scripts/apply-deploy.mjs)");
const DEPLOYER_KEY = need(env("DEPLOYER_PRIVATE_KEY"), "DEPLOYER_PRIVATE_KEY");

const abi = parseAbi([
  // The custom errors have to be here or viem cannot name a revert.
  "error AlreadySubmitted()",
  "error BadSignature()",
  "error NoSlots()",
  "error CapReached()",
  "error ScoreTooLow()",
  "error ScoreTooHigh()",
  "error EscrowEmpty()",
  "function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
  "event TrajectoryAccepted(uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor, bytes32 trajHash, string cid, uint16 score, uint256 paid)",
]);

/**
 * A pick-and-place the arm actually performs.
 *
 * The joint angles are solved from the payload's position at every frame with
 * the station's own solver, so while the jaws are closed the tool is where the
 * payload is and the recording's two columns describe one event. The seed
 * offsets the start, the lift and the pace, so no two seeds share a route and a
 * second run on a task is not refused as a copy of the first.
 */
function makeRun(seed) {
  const rnd = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const hz = 20;
  const secs = 60 + Math.round(rnd(1) * 35);
  const dev = 2.5 + rnd(2) * 4;
  const n = hz * secs;
  // Kept inside the arm's reach at every lift, so the solver never has to clamp.
  const from = [0.22 + rnd(3) * 0.06, 0.1 + rnd(4) * 0.08];
  const goal = [0.17, -0.24];
  const lift = 0.12 + rnd(5) * 0.1;
  const samples = [];
  let clamped = 0;
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const object = [from[0] + (goal[0] - from[0]) * e, from[1] + (goal[1] - from[1]) * e, Math.sin(Math.PI * u) * lift];
    const j = solve(object);
    if (j.clamped) clamped += 1;
    samples.push({
      t: Number((i / hz).toFixed(3)),
      q: [j.j1, j.j2, j.j3, 0, j.j5, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object,
    });
  }
  samples[samples.length - 1].object = [goal[0] + dev / 1000, goal[1], 0];
  return { run: { samples, durationSeconds: secs, deviationMm: Number(dev.toFixed(2)), success: true }, clamped };
}

/** The corpus's coherence measurement, repeated here so an incoherent run is never sent. */
function heldDistanceMm(samples) {
  const d = samples
    .filter((s) => s.grip <= GRIP_CLOSED_MM)
    .map((s) => {
      const t = toolPosition({ j1: s.q[0], j2: s.q[1], j3: s.q[2], j5: s.q[4], clamped: false });
      return Math.hypot(t[0] - s.object[0], t[1] - s.object[1]);
    })
    .sort((a, b) => a - b);
  return d[d.length >> 1] * 1000;
}

const pub = createPublicClient({ chain: appChain, transport: transport() });
const funder = createWalletClient({ account: privateKeyToAccount(DEPLOYER_KEY), chain: appChain, transport: transport() });
const op = privateKeyToAccount(generatePrivateKey());
const operator = createWalletClient({ account: op, chain: appChain, transport: transport() });

console.log(`task      #${TASK}  seed ${SEED}  operator ${op.address}`);

const { run, clamped } = makeRun(SEED);
const heldMm = heldDistanceMm(run.samples);
console.log(`arm       tool ${heldMm.toFixed(1)} mm from the payload while holding it; ${clamped} frames clamped`);
if (!(heldMm < COHERENT_MM) || clamped > 0) {
  console.log("refused   by this script: the arm and the payload would not describe the same event");
  process.exit(1);
}

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
console.log(`verified  score ${(v.score / 100).toFixed(2)}  accepted ${v.accepted}  pays up to ${formatEther(BigInt(v.rewardWei))} MON`);
if (!v.accepted) process.exit(1);

const call = {
  address: AXON, abi, functionName: "submitTrajectory",
  args: [BigInt(TASK), v.trajHash, v.cid, v.score, v.signature],
};
const [estimate, fees] = await Promise.all([
  pub.estimateContractGas({ ...call, account: op.address }),
  pub.estimateFeesPerGas(),
]);
const gasLimit = (estimate * 11n) / 10n;
const fund = await funder.sendTransaction({ to: op.address, value: gasLimit * fees.maxFeePerGas });
await pub.waitForTransactionReceipt({ hash: fund });
const before = await pub.getBalance({ address: op.address });

const hash = await operator.writeContract({ ...call, gas: gasLimit });
const t0 = Date.now();
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(`submitted ${receipt.status} in block ${receipt.blockNumber} after ${Date.now() - t0} ms`);
if (receipt.status !== "success") process.exit(1);

const [accepted] = parseEventLogs({ abi, logs: receipt.logs, eventName: "TrajectoryAccepted" });
const after = await pub.getBalance({ address: op.address });
const gas = receipt.gasUsed * receipt.effectiveGasPrice;
console.log(`paid      ${formatEther(accepted.args.paid)} MON in that transaction; gas ${formatEther(gas)} MON on a ${gasLimit} limit`);
console.log(`balance   +${formatEther(after - before + gas)} MON net of gas`);

const s = await fetch(`${BASE}/api/submitted`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ trajHash: v.trajHash, txHash: hash }),
});
console.log(`recorded  ${s.status} ${JSON.stringify(await s.json())}`);
console.log(`monadscan ${txUrl(hash)}`);
