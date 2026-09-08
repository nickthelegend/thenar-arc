import "server-only";
import { appChain } from "@/lib/chain";
import { migrate, query, queryOne, run, count, ENGINE } from "@/lib/server/sql";

export { ENGINE, query, queryOne, count } from "@/lib/server/sql";

/**
 * Trajectory store.
 *
 * The chain holds the hash, the score and the payment. It cannot hold the
 * trajectory itself — a 20 Hz recording of a two-minute run is tens of
 * kilobytes, and there are meant to be millions of them. This is where the
 * actual data lives, addressed by the same hash the chain records, so any
 * payout can be recomputed from the artefact that earned it.
 *
 * Every accessor is async because the store may be across a socket rather than
 * on the filesystem. That is the whole cost of not being one file on one disk,
 * and it is paid here rather than by each caller writing its own SQL.
 */

/** Called before every access. The promise is memoised, so this is one round
 *  trip on the first query and free afterwards. */
async function db() {
  await migrate();
}

export type StoredTrajectory = {
  traj_hash: string;
  task_id: number;
  contributor: string;
  score: number;
  deviation_mm: number;
  duration_s: number;
  placement: number;
  efficiency: number;
  smoothness: number;
  sample_count: number;
  samples: string;
  signature: string;
  created_at: number;
  tx_hash: string | null;
  chain_id: number | null;
  payload_ids: string | null;
};

export async function insertTrajectory(
  row: Omit<StoredTrajectory, "tx_hash" | "chain_id">,
): Promise<void> {
  await db();
  // Re-scoring the same recording must not create a second row, and must not
  // fail either: the verifier hands back the signature it already issued.
  await run(
    `INSERT INTO trajectory
       (traj_hash, task_id, contributor, score, deviation_mm, duration_s,
        placement, efficiency, smoothness, sample_count, samples, signature,
        created_at, chain_id, payload_ids)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (traj_hash) DO NOTHING`,
    [
      row.traj_hash, row.task_id, row.contributor, row.score, row.deviation_mm,
      row.duration_s, row.placement, row.efficiency, row.smoothness,
      row.sample_count, row.samples, row.signature, row.created_at,
      appChain.id, row.payload_ids ?? null,
    ],
  );
}

export async function getTrajectory(hash: string): Promise<StoredTrajectory | undefined> {
  await db();
  return queryOne<StoredTrajectory>(`SELECT * FROM trajectory WHERE traj_hash = ?`, [hash]);
}

/** Only ever called once the receipt has been read back as successful. */
export async function markSettled(hash: string, txHash: string): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET tx_hash = ?, settled = 1 WHERE traj_hash = ?`, [txHash, hash]);
}

/** Rows whose settlement has not been established, oldest first. */
export async function unsettledWithTx(limit = 500) {
  await db();
  return query<{ traj_hash: string; tx_hash: string }>(
    `SELECT traj_hash, tx_hash FROM trajectory
      WHERE settled = 0 AND tx_hash IS NOT NULL LIMIT ?`,
    [limit],
  );
}

/** Drop a transaction that turned out not to have settled. */
export async function clearTx(hash: string): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET tx_hash = NULL, settled = 0 WHERE traj_hash = ?`, [hash]);
}

export async function recentTrajectories(limit = 20) {
  await db();
  return query<Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness" | "payload_ids">>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, tx_hash
       FROM trajectory WHERE settled = 1 AND chain_id = ? ORDER BY created_at DESC LIMIT ?`,
    [appChain.id, limit],
  );
}

export async function trajectoriesForTask(taskId: number, limit = 200) {
  await db();
  return query<{
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, tx_hash
       FROM trajectory WHERE task_id = ? AND settled = 1 AND chain_id = ?
      ORDER BY score DESC LIMIT ?`,
    [taskId, appChain.id, limit],
  );
}

export async function countTrajectories(): Promise<number> {
  await db();
  return count(`SELECT COUNT(*) AS n FROM trajectory WHERE settled = 1 AND chain_id = ?`, [appChain.id]);
}

/** Settled rows whose chain has never been established. */
export async function unresolvedChain(limit = 500) {
  await db();
  return query<{ traj_hash: string; tx_hash: string }>(
    `SELECT traj_hash, tx_hash FROM trajectory
      WHERE chain_id IS NULL AND tx_hash IS NOT NULL LIMIT ?`,
    [limit],
  );
}

/** Record the chain a transaction was found on. Only ever called after a
 *  receipt for that exact hash came back from that exact chain. */
export async function setChainId(hash: string, chainId: number): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET chain_id = ? WHERE traj_hash = ?`, [chainId, hash]);
}

/** How the stored runs divide across chains, for the integrity check. */
export async function countByChain() {
  await db();
  const rows = await query<{ chain_id: number | null; n: number | string }>(
    `SELECT chain_id, COUNT(*) AS n FROM trajectory
      WHERE settled = 1 GROUP BY chain_id ORDER BY COUNT(*) DESC`,
  );
  return rows.map((r) => ({ chain_id: r.chain_id, n: Number(r.n) }));
}

/** Runs recorded under a previous deployment, for the archive. */
export async function trajectoriesOnChain(chainId: number, limit = 500) {
  await db();
  return query<Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness" | "payload_ids">>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, tx_hash, chain_id
       FROM trajectory WHERE settled = 1 AND chain_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    [chainId, limit],
  );
}

// ---------------------------------------------------------------- props

export type StoredProp = {
  id: string;
  label: string;
  role: "payload" | "target";
  width_mm: number;
  bytes: number;
  sha256: string;
  uploader: string;
  created_at: number;
};

/**
 * Store a funder's own model.
 *
 * The GLB itself goes in the row rather than on disk: the store is what
 * survives a redeploy, and a scene whose model went missing would make every
 * run recorded against it unreproducible.
 */
export async function insertProp(row: StoredProp & { glb: Buffer }): Promise<void> {
  await db();
  await run(
    `INSERT INTO prop (id, label, role, width_mm, bytes, sha256, uploader, created_at, glb)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [row.id, row.label, row.role, row.width_mm, row.bytes, row.sha256,
     row.uploader, row.created_at, row.glb],
  );
}

export async function getPropBlob(id: string): Promise<{ glb: Buffer; bytes: number } | undefined> {
  await db();
  const r = await queryOne<{ glb: Buffer | Uint8Array; bytes: number }>(
    "SELECT glb, bytes FROM prop WHERE id = ?", [id],
  );
  if (!r) return undefined;
  return { glb: Buffer.from(r.glb), bytes: Number(r.bytes) };
}

export async function listProps(limit = 200): Promise<StoredProp[]> {
  await db();
  return query<StoredProp>(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function propBySha(sha: string): Promise<StoredProp | undefined> {
  await db();
  return queryOne<StoredProp>(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop WHERE sha256 = ?`,
    [sha],
  );
}
