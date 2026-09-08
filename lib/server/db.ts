import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { appChain } from "@/lib/chain";

/**
 * Trajectory store.
 *
 * The chain holds the hash, the score and the payment. It cannot hold the
 * trajectory itself — a 20 Hz recording of a two-minute run is tens of
 * kilobytes, and there are meant to be millions of them. This is where the
 * actual data lives, addressed by the same hash the chain records, so any
 * payout can be recomputed from the artefact that earned it.
 *
 * SQLite on a real file: it survives restarts and deploys with a volume
 * attached. AXON_DB_PATH points it somewhere persistent in production.
 */

const DB_PATH = process.env.AXON_DB_PATH ?? path.join(process.cwd(), ".data", "axon.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    -- Props a task funder uploaded. The bytes live on the same persistent
    -- volume as the trajectories, because a scene whose model disappears makes
    -- every run recorded against it unreproducible.
    CREATE TABLE IF NOT EXISTS prop (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      role        TEXT NOT NULL,
      width_mm    REAL NOT NULL,
      bytes       INTEGER NOT NULL,
      sha256      TEXT NOT NULL,
      uploader    TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      glb         BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trajectory (
      traj_hash     TEXT PRIMARY KEY,
      task_id       INTEGER NOT NULL,
      contributor   TEXT NOT NULL,
      score         INTEGER NOT NULL,
      deviation_mm  REAL NOT NULL,
      duration_s    REAL NOT NULL,
      placement     REAL NOT NULL,
      efficiency    REAL NOT NULL,
      smoothness    REAL NOT NULL,
      sample_count  INTEGER NOT NULL,
      samples       TEXT NOT NULL,
      signature     TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      tx_hash       TEXT,
      -- 1 only once the chain has been asked and the receipt came back
      -- successful. A hash on its own proves nothing: a reverted transaction
      -- has one too, and recording those made the task pages show runs the
      -- contract had never accepted.
      settled       INTEGER NOT NULL DEFAULT 0,
      -- The prop ids this run was driven against, JSON, or NULL when the
      -- instruction already determined them. Part of the hashed trajectory
      -- when present, so a replay draws the objects the operator actually had
      -- rather than re-deriving a scene that may have been free to vary.
      payload_ids   TEXT,
      -- Which chain the tx_hash resolves on. NULL means not yet established.
      -- This deployment has settled on more than one chain, and a run is only
      -- verifiable against the chain it was actually written to.
      chain_id      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
    CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
    CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);
  `);

  // Databases created before `settled` existed still have their rows.
  const cols = db.prepare(`PRAGMA table_info(trajectory)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "settled")) {
    db.exec(`ALTER TABLE trajectory ADD COLUMN settled INTEGER NOT NULL DEFAULT 0`);
  }
  // Databases created before the move off Monad have no idea which chain their
  // rows belong to. The column is left NULL rather than defaulted to the
  // current chain: guessing here is exactly what put unverifiable transactions
  // on the public feed. /api/reconcile establishes it by asking each chain.
  if (!cols.some((c) => c.name === "chain_id")) {
    db.exec(`ALTER TABLE trajectory ADD COLUMN chain_id INTEGER`);
  }
  // Rows written before a scene could vary have no ids, and correctly so: their
  // instruction named their objects, and they hash as version 1 without them.
  if (!cols.some((c) => c.name === "payload_ids")) {
    db.exec(`ALTER TABLE trajectory ADD COLUMN payload_ids TEXT`);
  }
  // Safe either way: the columns exist by now, freshly created or just added.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id)`);

  return db;
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

export function insertTrajectory(row: Omit<StoredTrajectory, "tx_hash" | "chain_id">) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO trajectory
       (traj_hash, task_id, contributor, score, deviation_mm, duration_s,
        placement, efficiency, smoothness, sample_count, samples, signature, created_at,
        chain_id, payload_ids)
       VALUES (@traj_hash, @task_id, @contributor, @score, @deviation_mm, @duration_s,
               @placement, @efficiency, @smoothness, @sample_count, @samples, @signature,
               @created_at, @chain_id, @payload_ids)`,
    )
    .run({ ...row, chain_id: appChain.id });
}

export function getTrajectory(hash: string): StoredTrajectory | undefined {
  return getDb().prepare(`SELECT * FROM trajectory WHERE traj_hash = ?`).get(hash) as
    | StoredTrajectory
    | undefined;
}

/** Only ever called once the receipt has been read back as successful. */
export function markSettled(hash: string, txHash: string) {
  getDb()
    .prepare(`UPDATE trajectory SET tx_hash = ?, settled = 1 WHERE traj_hash = ?`)
    .run(txHash, hash);
}

/** Rows whose settlement has not been established, oldest first. */
export function unsettledWithTx(limit = 500) {
  return getDb()
    .prepare(`SELECT traj_hash, tx_hash FROM trajectory
              WHERE settled = 0 AND tx_hash IS NOT NULL LIMIT ?`)
    .all(limit) as { traj_hash: string; tx_hash: string }[];
}

/** Drop a transaction that turned out not to have settled. */
export function clearTx(hash: string) {
  getDb().prepare(`UPDATE trajectory SET tx_hash = NULL, settled = 0 WHERE traj_hash = ?`).run(hash);
}

export function recentTrajectories(limit = 20) {
  return getDb()
    .prepare(
      `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
              sample_count, created_at, tx_hash
       FROM trajectory WHERE settled = 1 AND chain_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(appChain.id, limit) as Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness">[];
}

export function trajectoriesForTask(taskId: number, limit = 200) {
  return getDb()
    .prepare(
      `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, tx_hash
       FROM trajectory WHERE task_id = ? AND settled = 1 AND chain_id = ?
        ORDER BY score DESC LIMIT ?`,
    )
    .all(taskId, appChain.id, limit) as {
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
  }[];
}

export function countTrajectories(): number {
  return (getDb()
    .prepare(`SELECT COUNT(*) AS n FROM trajectory WHERE settled = 1 AND chain_id = ?`)
    .get(appChain.id) as { n: number }).n;
}

/** Settled rows whose chain has never been established. */
export function unresolvedChain(limit = 500) {
  return getDb()
    .prepare(`SELECT traj_hash, tx_hash FROM trajectory
              WHERE chain_id IS NULL AND tx_hash IS NOT NULL LIMIT ?`)
    .all(limit) as { traj_hash: string; tx_hash: string }[];
}

/** Record the chain a transaction was found on. Only ever called after a
 *  receipt for that exact hash came back from that exact chain. */
export function setChainId(hash: string, chainId: number) {
  getDb().prepare(`UPDATE trajectory SET chain_id = ? WHERE traj_hash = ?`).run(chainId, hash);
}

/** How the stored runs divide across chains, for the integrity check. */
export function countByChain(): { chain_id: number | null; n: number }[] {
  return getDb()
    .prepare(`SELECT chain_id, COUNT(*) AS n FROM trajectory
              WHERE settled = 1 GROUP BY chain_id ORDER BY n DESC`)
    .all() as { chain_id: number | null; n: number }[];
}

/** Runs recorded under a previous deployment, for the archive. */
export function trajectoriesOnChain(chainId: number, limit = 500) {
  return getDb()
    .prepare(
      `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
              sample_count, created_at, tx_hash, chain_id
       FROM trajectory WHERE settled = 1 AND chain_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chainId, limit) as (Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness">)[];
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
 * The GLB itself goes in the row rather than on disk: the volume is what
 * survives a redeploy, and a scene whose model went missing would make every
 * run recorded against it unreproducible.
 */
export function insertProp(row: StoredProp & { glb: Buffer }) {
  getDb().prepare(
    `INSERT INTO prop (id, label, role, width_mm, bytes, sha256, uploader, created_at, glb)
     VALUES (@id, @label, @role, @width_mm, @bytes, @sha256, @uploader, @created_at, @glb)`,
  ).run(row);
}

export function getPropBlob(id: string): { glb: Buffer; bytes: number } | undefined {
  return getDb().prepare("SELECT glb, bytes FROM prop WHERE id = ?").get(id) as
    | { glb: Buffer; bytes: number }
    | undefined;
}

export function listProps(limit = 200): StoredProp[] {
  return getDb().prepare(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop ORDER BY created_at DESC LIMIT ?`,
  ).all(limit) as StoredProp[];
}

export function propBySha(sha: string): StoredProp | undefined {
  return getDb().prepare(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop WHERE sha256 = ?`,
  ).get(sha) as StoredProp | undefined;
}
