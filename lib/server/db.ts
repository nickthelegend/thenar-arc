import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

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
      settled       INTEGER NOT NULL DEFAULT 0
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
  // Safe either way: the column exists by now, freshly created or just added.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled)`);

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
};

export function insertTrajectory(row: Omit<StoredTrajectory, "tx_hash">) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO trajectory
       (traj_hash, task_id, contributor, score, deviation_mm, duration_s,
        placement, efficiency, smoothness, sample_count, samples, signature, created_at)
       VALUES (@traj_hash, @task_id, @contributor, @score, @deviation_mm, @duration_s,
               @placement, @efficiency, @smoothness, @sample_count, @samples, @signature, @created_at)`,
    )
    .run(row);
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
       FROM trajectory WHERE settled = 1 ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness">[];
}

export function trajectoriesForTask(taskId: number, limit = 200) {
  return getDb()
    .prepare(
      `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, tx_hash
       FROM trajectory WHERE task_id = ? AND settled = 1 ORDER BY score DESC LIMIT ?`,
    )
    .all(taskId, limit) as {
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
  }[];
}

export function countTrajectories(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM trajectory WHERE settled = 1`).get() as { n: number }).n;
}
