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
      tx_hash       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
    CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
    CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);
  `);

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

export function markSubmitted(hash: string, txHash: string) {
  getDb().prepare(`UPDATE trajectory SET tx_hash = ? WHERE traj_hash = ?`).run(txHash, hash);
}

export function recentTrajectories(limit = 20) {
  return getDb()
    .prepare(
      `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
              sample_count, created_at, tx_hash
       FROM trajectory ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness">[];
}

export function trajectoriesForTask(taskId: number, limit = 200) {
  return getDb()
    .prepare(
      `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, tx_hash
       FROM trajectory WHERE task_id = ? ORDER BY score DESC LIMIT ?`,
    )
    .all(taskId, limit) as {
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
  }[];
}

export function countTrajectories(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM trajectory`).get() as { n: number }).n;
}
