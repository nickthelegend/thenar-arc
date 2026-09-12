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
  await migrate();
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
  await migrate();
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

/**
 * Memoised, and awaited by every call above rather than by convention.
 *
 * The schema used to be created by whichever caller happened to run first,
 * because only the typed accessors in db.ts awaited it and the three routes
 * that write their own SQL import `query` straight from here. In production
 * something else always ran first and it looked fine; locally the dataset
 * route was hit on a cold process and answered "no such column: contract".
 *
 * A migration that depends on call order is not a migration. Awaiting it here
 * costs one already-settled promise per query and makes the ordering
 * impossible to get wrong.
 */
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
          payload_ids   TEXT,
          -- Which deployment accepted this run. A protocol can be superseded
          -- without moving chain, and a feed that mixed two contracts would
          -- report a count the live one would deny.
          contract      TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
        CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
        CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);

        -- Two integers and a date. There is deliberately no room in this table
        -- for an address, an agent string, a session or an id: a counter that
        -- cannot identify anyone cannot later be asked to.
        CREATE TABLE IF NOT EXISTS pageview (
          path  TEXT NOT NULL,
          day   TEXT NOT NULL,
          n     INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (path, day)
        );

        -- What operators found out about a task by driving it. The signature
        -- is kept beside the body because it is the only thing making the
        -- author's name mean anything: there are no accounts here, so an
        -- address without a signature over the text is a claim, not a byline.
        -- A policy somebody submitted, and what it scored when this server
        -- rolled it out. The weights are kept so the evaluation can be
        -- reproduced by anyone: a leaderboard whose entries cannot be re-run
        -- is a list of claims.
        -- What the operator says they did on one specific run.
        --
        -- The task instruction says what was asked; this says what happened —
        -- "came in too flat and had to re-seat it" — which is the language a
        -- policy conditioned on text actually needs and which exists nowhere
        -- else. Signed, because there are no accounts here and an unsigned
        -- annotation is a sentence anybody could have typed against your run.
        CREATE TABLE IF NOT EXISTS annotation (
          traj_hash  TEXT PRIMARY KEY,
          author     TEXT NOT NULL,
          body       TEXT NOT NULL,
          signature  TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        -- What the operator says they did on one specific run.
      --
      -- The task instruction says what was asked; this says what happened —
      -- "came in too flat and had to re-seat it" — which is the language a
      -- policy conditioned on text actually needs and which exists nowhere
      -- else. Signed, because there are no accounts here and an unsigned
      -- annotation is a sentence anybody could have typed against your run.
      CREATE TABLE IF NOT EXISTS annotation (
        traj_hash  TEXT PRIMARY KEY,
        author     TEXT NOT NULL,
        body       TEXT NOT NULL,
        signature  TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_submission (
          weights_hash TEXT PRIMARY KEY,
          submitter    TEXT NOT NULL,
          label        TEXT NOT NULL,
          grasped      INTEGER NOT NULL,
          placed       INTEGER NOT NULL,
          median_mm    DOUBLE PRECISION NOT NULL,
          starts       INTEGER NOT NULL,
          weights      TEXT NOT NULL,
          created_at   BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_policy_rank
          ON policy_submission(placed DESC, grasped DESC, median_mm ASC);

        -- A policy somebody submitted, and what it scored when this server
      -- rolled it out. The weights are kept so the evaluation can be
      -- reproduced by anyone: a leaderboard whose entries cannot be re-run
      -- is a list of claims.
      CREATE TABLE IF NOT EXISTS policy_submission (
        weights_hash TEXT PRIMARY KEY,
        submitter    TEXT NOT NULL,
        label      TEXT NOT NULL,
        grasped      INTEGER NOT NULL,
        placed       INTEGER NOT NULL,
        median_mm    REAL NOT NULL,
        starts       INTEGER NOT NULL,
        weights      TEXT NOT NULL,
        created_at   BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_policy_rank
        ON policy_submission(placed DESC, grasped DESC, median_mm ASC);

      CREATE TABLE IF NOT EXISTS note (
          id         TEXT PRIMARY KEY,
          task_id    INTEGER NOT NULL,
          author     TEXT NOT NULL,
          body       TEXT NOT NULL,
          signature  TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_task ON note(task_id, created_at DESC);

        -- Who a task's funder says is working on it with them. Signed, because
        -- there are no accounts here and an unsigned roster is a list of
        -- addresses anybody could have typed.
        -- Where to push a notice, and what the reader asked to hear about.
        -- No address, no email, no name: a push endpoint is issued by the
        -- browser's own push service and identifies a subscription rather than
        -- a person, which is the only kind of contact detail this project has
        -- any business holding.
        CREATE TABLE IF NOT EXISTS pushsub (
          endpoint   TEXT PRIMARY KEY,
          p256dh     TEXT NOT NULL,
          auth       TEXT NOT NULL,
          topic      TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS collaborator (
          task_id    INTEGER NOT NULL,
          member     TEXT NOT NULL,
          role       TEXT NOT NULL,
          signature  TEXT NOT NULL,
          added_at   BIGINT NOT NULL,
          PRIMARY KEY (task_id, member)
        );
      `);

      // CREATE TABLE IF NOT EXISTS does nothing to a table that already
      // exists, so the block above can only ever create the schema — it can
      // never grow it. The SQLite branch had always had an ALTER path and this
      // one did not, which meant the first column added after the corpus moved
      // to Postgres took the site down with "column does not exist".
      //
      // IF NOT EXISTS on each, so this is safe on every boot and safe on a
      // database that already has them.
      await c.query(`
        ALTER TABLE trajectory ADD COLUMN IF NOT EXISTS settled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE trajectory ADD COLUMN IF NOT EXISTS chain_id INTEGER;
        ALTER TABLE trajectory ADD COLUMN IF NOT EXISTS payload_ids TEXT;
        ALTER TABLE trajectory ADD COLUMN IF NOT EXISTS contract TEXT;
      `);

      // And only now the indexes that name those columns. This is the same
      // ordering the SQLite branch already had, and putting them in the create
      // block above was what actually broke the deploy: CREATE INDEX on a
      // column that does not exist yet throws, taking the ALTER that would
      // have added it down with the rest of the statement.
      await c.query(`
        CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled);
        CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id);
        CREATE INDEX IF NOT EXISTS idx_traj_contract ON trajectory(contract);
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
        payload_ids   TEXT,
        contract      TEXT
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
      ["contract", "TEXT"],
    ] as const) {
      if (!cols.includes(name)) db.exec(`ALTER TABLE trajectory ADD COLUMN ${name} ${decl}`);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled);
      CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id);

      CREATE TABLE IF NOT EXISTS pageview (
        path  TEXT NOT NULL,
        day   TEXT NOT NULL,
        n     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (path, day)
      );

      CREATE TABLE IF NOT EXISTS note (
        id         TEXT PRIMARY KEY,
        task_id    INTEGER NOT NULL,
        author     TEXT NOT NULL,
        body       TEXT NOT NULL,
        signature  TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_note_task ON note(task_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS pushsub (
        endpoint   TEXT PRIMARY KEY,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        topic      TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collaborator (
        task_id    INTEGER NOT NULL,
        member     TEXT NOT NULL,
        role       TEXT NOT NULL,
        signature  TEXT NOT NULL,
        added_at   INTEGER NOT NULL,
        PRIMARY KEY (task_id, member)
      );

      -- These two exist in the Postgres branch above and did not exist here,
      -- which is the failure this file's own header says the single ENGINE
      -- switch is meant to prevent: one store answering a query the other
      -- 500s on. /api/policy and the annotation routes were broken against
      -- every SQLite database, new or old, and nothing said so until a page
      -- that reads them was opened against one.
      CREATE TABLE IF NOT EXISTS annotation (
        traj_hash  TEXT PRIMARY KEY,
        author     TEXT NOT NULL,
        body       TEXT NOT NULL,
        signature  TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_submission (
        weights_hash TEXT PRIMARY KEY,
        submitter    TEXT NOT NULL,
        label        TEXT NOT NULL,
        grasped      INTEGER NOT NULL,
        placed       INTEGER NOT NULL,
        median_mm    REAL NOT NULL,
        starts       INTEGER NOT NULL,
        weights      TEXT NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_policy_rank
        ON policy_submission(placed DESC, grasped DESC, median_mm ASC);
    `);
  })();
  return ready;
}

/**
 * Give every pre-existing row the deployment it actually settled against.
 *
 * Rows written before the column existed carry no contract, and they are not
 * all the same one — this project has settled on Monad and on two Avalanche
 * deployments. The chain each row already records is enough to say which,
 * because only one contract was ever live per chain at the time. Run once,
 * touching only rows that have no contract, so it cannot rewrite a row that
 * already knows its own answer.
 */
export async function backfillContracts(current: string, prior: readonly { address: string; chainId: number }[]) {
  await migrate();
  let filled = 0;
  for (const p of prior) {
    const before = await count(`SELECT COUNT(*) AS n FROM trajectory WHERE contract IS NULL AND chain_id = ?`, [p.chainId]);
    if (before === 0) continue;
    await run(`UPDATE trajectory SET contract = ? WHERE contract IS NULL AND chain_id = ?`,
      [p.address.toLowerCase(), p.chainId]);
    filled += before;
  }
  // Anything still unattributed settled on a chain no prior deployment claims,
  // which for this project means the current one.
  const rest = await count(`SELECT COUNT(*) AS n FROM trajectory WHERE contract IS NULL`);
  if (rest > 0) {
    await run(`UPDATE trajectory SET contract = ? WHERE contract IS NULL`, [current.toLowerCase()]);
    filled += rest;
  }
  return filled;
}
