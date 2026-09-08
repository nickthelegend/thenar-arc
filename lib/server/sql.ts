import "server-only";

/**
 * The store, whichever one it is.
 *
 * One SQLite file on a volume was enough while there was one writer and one
 * container. It stopped being the right answer for a corpus that is meant to
 * be the asset: a single file cannot be read by a second instance, cannot be
 * restored to a point in time, and puts the durability of every payout's
 * evidence on one disk staying attached.
 *
 * Postgres in production, SQLite in development. Not a fallback ladder — the
 * engine is chosen once by whether DATABASE_URL is set, and nothing silently
 * degrades from one to the other. A developer gets a file they can delete; a
 * deployment gets a database with its own backups.
 *
 * The two are kept behind one interface deliberately narrow enough to be
 * portable: parameterised statements with `?`, no engine-specific SQL above
 * this file. `?` is translated to `$n` for Postgres here, in the one place
 * that knows which engine it is talking to.
 */

export type Row = Record<string, unknown>;

const url = process.env.DATABASE_URL;
export const ENGINE: "postgres" | "sqlite" = url ? "postgres" : "sqlite";

// ------------------------------------------------------------------ postgres

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }>;
};

let pool: PgPool | null = null;

async function pg(): Promise<PgPool> {
  if (pool) return pool;
  const { Pool, types } = await import("pg");

  // int8 arrives as a string by default, because Postgres bigints do not all
  // fit in a double. Ours are millisecond timestamps and byte counts, both far
  // inside the safe range, and leaving them as strings would sort `created_at`
  // lexically — putting a run recorded at 9:59 after one recorded at 10:00.
  types.setTypeParser(20, (v: string) => Number(v));
  // numeric, same reasoning: these are scores and millimetres, not money.
  types.setTypeParser(1700, (v: string) => Number(v));

  pool = new Pool({
    connectionString: url,
    max: 8,
    // The private network is not the public internet, but Railway's Postgres
    // presents a self-signed certificate; refusing it would mean no connection
    // at all rather than a safer one.
    ssl: url?.includes("railway.internal") ? undefined : { rejectUnauthorized: false },
  }) as unknown as PgPool;
  return pool;
}

/** `?` placeholders, so the SQL above this file does not know the engine. */
function toPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// -------------------------------------------------------------------- sqlite

type SqliteDb = {
  prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; run: (...p: unknown[]) => unknown };
  exec: (sql: string) => unknown;
  pragma: (s: string) => unknown;
};

let sqlite: SqliteDb | null = null;

async function lite(): Promise<SqliteDb> {
  if (sqlite) return sqlite;
  const path = await import("node:path");
  const fs = await import("node:fs");
  const Database = (await import("better-sqlite3")).default;
  const file = process.env.AXON_DB_PATH ?? path.join(process.cwd(), ".data", "axon.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file) as unknown as SqliteDb;
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  sqlite = db;
  return db;
}

// --------------------------------------------------------------------- calls

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (ENGINE === "postgres") {
    const c = await pg();
    const r = await c.query(toPg(sql), params);
    return r.rows as T[];
  }
  const db = await lite();
  return db.prepare(sql).all(...params) as T[];
}

export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (ENGINE === "postgres") {
    const c = await pg();
    await c.query(toPg(sql), params);
    return;
  }
  const db = await lite();
  db.prepare(sql).run(...params);
}

/** A single scalar count, which is most of what this app asks of its store. */
export async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ n: number | string }>(sql, params);
  return Number(row?.n ?? 0);
}

// ------------------------------------------------------------------ schema

let ready: Promise<void> | null = null;

/**
 * Create the schema if it is not there.
 *
 * Written twice rather than generated from one string with substitutions: the
 * two dialects differ in exactly the places that matter — BYTEA against BLOB,
 * BIGINT against INTEGER for millisecond timestamps — and a shared template
 * with holes in it would hide that behind a diff nobody reads.
 */
export function migrate(): Promise<void> {
  ready ??= (async () => {
    if (ENGINE === "postgres") {
      const c = await pg();
      await c.query(`
        CREATE TABLE IF NOT EXISTS prop (
          id          TEXT PRIMARY KEY,
          label       TEXT NOT NULL,
          role        TEXT NOT NULL,
          width_mm    DOUBLE PRECISION NOT NULL,
          bytes       BIGINT NOT NULL,
          sha256      TEXT NOT NULL,
          uploader    TEXT NOT NULL,
          created_at  BIGINT NOT NULL,
          glb         BYTEA NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trajectory (
          traj_hash     TEXT PRIMARY KEY,
          task_id       INTEGER NOT NULL,
          contributor   TEXT NOT NULL,
          score         INTEGER NOT NULL,
          deviation_mm  DOUBLE PRECISION NOT NULL,
          duration_s    DOUBLE PRECISION NOT NULL,
          placement     DOUBLE PRECISION NOT NULL,
          efficiency    DOUBLE PRECISION NOT NULL,
          smoothness    DOUBLE PRECISION NOT NULL,
          sample_count  INTEGER NOT NULL,
          samples       TEXT NOT NULL,
          signature     TEXT NOT NULL,
          created_at    BIGINT NOT NULL,
          tx_hash       TEXT,
          settled       INTEGER NOT NULL DEFAULT 0,
          chain_id      INTEGER,
          payload_ids   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
        CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
        CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled);
        CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id);
      `);
      return;
    }

    const db = await lite();
    db.exec(`
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
        settled       INTEGER NOT NULL DEFAULT 0,
        chain_id      INTEGER,
        payload_ids   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
      CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
      CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);
    `);

    // Files created before these columns existed still hold their rows, and
    // those rows are the evidence behind settled payouts.
    //
    // This has to happen before the indexes that name these columns, not
    // alongside the CREATE TABLEs. On a fresh database the order does not
    // matter and the difference is invisible; against a file written before
    // the column existed, indexing it first fails the whole statement and the
    // store never opens at all.
    const cols = (db.prepare(`PRAGMA table_info(trajectory)`).all() as { name: string }[])
      .map((c) => c.name);
    for (const [name, decl] of [
      ["settled", "INTEGER NOT NULL DEFAULT 0"],
      ["chain_id", "INTEGER"],
      ["payload_ids", "TEXT"],
    ] as const) {
      if (!cols.includes(name)) db.exec(`ALTER TABLE trajectory ADD COLUMN ${name} ${decl}`);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled);
      CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id);
    `);
  })();
  return ready;
}
