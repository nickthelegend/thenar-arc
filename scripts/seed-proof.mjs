/** Restore original artifacts after verifying their hash and payout. No signer.
 * Testnet: pnpm seed:proof. Mainnet: pnpm seed:proof:mainnet (Mongo URI in .env.local).
 * Idempotent DB writes; all chain operations are reads.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keccak256, toHex, parseEventLogs } from 'viem';
import { AXON_ABI } from '../lib/abi.ts';
import { canonicalise } from '../lib/canonical.ts';
import { AXON_ADDRESS, appChain } from '../lib/chain.ts';
import { chainClient } from '../lib/rpc.ts';
import { insertTrajectory, markSettled, getTrajectory } from '../lib/server/db.ts';
if (![5042, 5042002].includes(appChain.id)) throw Error('Only Arc mainnet/testnet proof imports are supported');
const network = appChain.id === 5042 ? 'mainnet' : 'testnet';
const file = fileURLToPath(new URL(`../docs/proof/${network}-runs.json`, import.meta.url));
const { runs } = JSON.parse(readFileSync(file, 'utf8'));
const client = chainClient();
if (await client.getChainId() !== appChain.id) throw Error('RPC chain does not match artifact destination');
if (appChain.id === 5042 && (!process.env.MONGODB_URI || process.env.MONGODB_DB !== 'arc_thenar_mainnet' || process.env.DATABASE_URL)) throw Error('Mainnet proof import requires MongoDB arc_thenar_mainnet');
// Validate the complete batch before the first database mutation.
for (const r of runs) {
  if (r.chain_id != null && r.chain_id !== appChain.id) throw Error('Artifact chain mismatch');
  if (r.contract && r.contract.toLowerCase() !== AXON_ADDRESS.toLowerCase()) throw Error('Artifact contract mismatch');
  const samples = JSON.parse(r.samples);
  const hash = keccak256(toHex(canonicalise(r.task_id, r.contributor, samples, r.payload_ids ? JSON.parse(r.payload_ids) : undefined)));
  if (hash !== r.traj_hash.toLowerCase() || samples.length !== r.sample_count) throw Error(`Artifact integrity failed: ${r.traj_hash}`);
  const receipt = await client.getTransactionReceipt({ hash: r.tx_hash });
  const accepted = parseEventLogs({ abi: AXON_ABI, logs: receipt.logs, eventName: 'TrajectoryAccepted' }).find(l =>
    l.address.toLowerCase() === AXON_ADDRESS.toLowerCase() && String(l.args.trajHash).toLowerCase() === hash);
  if (receipt.status !== 'success' || !accepted || Number(accepted.args.taskId) !== r.task_id ||
      accepted.args.contributor.toLowerCase() !== r.contributor.toLowerCase() || Number(accepted.args.score) !== r.score || accepted.args.payout <= 0n) throw Error(`No matching successful payout for ${hash}`);
}
for (const r of runs) {
  const existing = await getTrajectory(r.traj_hash);
  if (existing && (existing.samples !== r.samples || existing.chain_id !== appChain.id || existing.contract !== AXON_ADDRESS.toLowerCase())) throw Error('Conflicting existing trajectory; refusing overwrite');
  const { tx_hash, ...row } = r;
  await insertTrajectory(row);
  await markSettled(r.traj_hash, tx_hash);
  const stored = await getTrajectory(r.traj_hash);
  if (stored?.tx_hash !== tx_hash || stored.samples !== r.samples) throw Error('Read-after-write mismatch');
  console.log(`Verified and stored ${r.traj_hash} (${r.sample_count} frames, ${tx_hash})`);
}
console.log(`${runs.length} ${network} artifacts verified on chain and read back from storage.`);
process.exit(0);
