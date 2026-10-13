/**
 * Put the two runs that were recorded and paid on the public Arc testnet into
 * this checkout's own run store, so /run/<hash> opens without a wallet.
 *
 *   NEXT_PUBLIC_ARC_NETWORK=testnet pnpm seed:proof
 *
 * Nothing is taken on trust: each run's settlement transaction is read back
 * from Arc testnet and has to be successful and to carry a TrajectoryAccepted
 * log for exactly this run on the deployed ThenarProtocol before the run is
 * stored. The run page then recomputes the hash from the samples ("Integrity
 * verified"). Safe to run twice. Reads docs/proof/testnet-runs.json.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEventLogs } from "viem";
import { AXON_ABI } from "../lib/abi.ts";
import { AXON_ADDRESS, appChain } from "../lib/chain.ts";
import { chainClient } from "../lib/rpc.ts";
import { insertTrajectory, markSettled } from "../lib/server/db.ts";

if (appChain.id !== 5042002) {
  console.error(`seed:proof stores Arc testnet runs; this build targets ${appChain.name} (${appChain.id}). Set NEXT_PUBLIC_ARC_NETWORK=testnet.`);
  process.exit(1);
}
const file = fileURLToPath(new URL("../docs/proof/testnet-runs.json", import.meta.url));
const { runs } = JSON.parse(readFileSync(file, "utf8"));
const client = chainClient();
let stored = 0;
for (const r of runs) {
  const hash = r.traj_hash.toLowerCase();
  const receipt = await client.getTransactionReceipt({ hash: r.tx_hash });
  const accepted = parseEventLogs({ abi: AXON_ABI, logs: receipt.logs, eventName: "TrajectoryAccepted" })
    .some((l) => l.address.toLowerCase() === AXON_ADDRESS.toLowerCase() && String(l.args.trajHash).toLowerCase() === hash);
  if (receipt.status !== "success" || !accepted) {
    console.error(`skip ${hash}: ${r.tx_hash} is not a successful TrajectoryAccepted for it on ${appChain.name}`);
    continue;
  }
  const { tx_hash, ...row } = r;
  await insertTrajectory(row);
  await markSettled(hash, tx_hash);
  stored++;
  console.log(`stored ${hash}  (paid in ${tx_hash}, block ${receipt.blockNumber})  ->  /run/${hash}`);
}
console.log(`${stored} of ${runs.length} runs stored from on-chain proof.`);
process.exit(stored === runs.length ? 0 : 1);
