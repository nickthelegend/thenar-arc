import { logged } from "@/lib/server/log";
import { NextResponse } from "next/server";
import { ENGINE, count } from "@/lib/server/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Copy the corpus out of the SQLite file and into the database.
 *
 * A one-shot, and deliberately written so it can be run before anything is
 * switched over. If this only worked once DATABASE_URL was live, the app would
 * already be reading an empty Postgres by the time the rows arrived, and the
 * site would show a protocol with no history for however long the copy took.
 * So the destination is named separately: this writes to MIGRATE_TARGET_URL
 * while everything else still reads the file.
 *
 * Idempotent. Every insert is ON CONFLICT DO NOTHING, keyed on the trajectory
 * hash and the prop id, so running it twice copies nothing the second time and
 * running it again after more runs have landed copies only those.
 */
async function handlePOST(req: Request) {
  const token = process.env.MIGRATE_TOKEN;
  if (!token || req.headers.get("x-migrate-token") !== token) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }

  const source = process.env.AXON_DB_PATH;
  if (!source) return NextResponse.json({ error: "AXON_DB_PATH is not set" }, { status: 400 });

  const target = process.env.MIGRATE_TARGET_URL ?? process.env.DATABASE_URL;
  if (!target) return NextResponse.json({ error: "no target database" }, { status: 400 });

  const fs = await import("node:fs");
  if (!fs.existsSync(source)) {
    return NextResponse.json({ error: `no file at ${source}` }, { status: 404 });
  }

  const Database = (await import("better-sqlite3")).default;
  const lite = new Database(source, { readonly: true });

  const { Pool, types } = await import("pg");
  types.setTypeParser(20, (v: string) => Number(v));
  const pool = new Pool({ connectionString: target, max: 4 });

  try {
    // The destination needs its schema before it can take rows, and the
    // destination is not necessarily the store this process reads — that is the
    // whole point of running this before the switch. So the schema goes to the
    // target pool directly. Idempotent, so it costs nothing when it is already
    // there.
    await pool.query(SCHEMA);

    const trajectories = lite.prepare("SELECT * FROM trajectory").all() as Record<string, unknown>[];
    const props = lite.prepare("SELECT * FROM prop").all() as Record<string, unknown>[];

    let copiedTrajectories = 0;
    for (const r of trajectories) {
      const res = await pool.query(
        `INSERT INTO trajectory
           (traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            placement, efficiency, smoothness, sample_count, samples, signature,
            created_at, tx_hash, settled, chain_id, payload_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (traj_hash) DO NOTHING`,
        [r.traj_hash, r.task_id, r.contributor, r.score, r.deviation_mm, r.duration_s,
         r.placement, r.efficiency, r.smoothness, r.sample_count, r.samples, r.signature,
         r.created_at, r.tx_hash ?? null, r.settled ?? 0, r.chain_id ?? null,
         r.payload_ids ?? null],
      );
      copiedTrajectories += res.rowCount ?? 0;
    }

    let copiedProps = 0;
    for (const r of props) {
      const res = await pool.query(
        `INSERT INTO prop (id, label, role, width_mm, bytes, sha256, uploader, created_at, glb)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.label, r.role, r.width_mm, r.bytes, r.sha256, r.uploader, r.created_at,
         Buffer.from(r.glb as Uint8Array)],
      );
      copiedProps += res.rowCount ?? 0;
    }

    // Read the destination back rather than reporting what was sent. A copy
    // that reports its own intentions is not a verified copy.
    const after = await pool.query("SELECT COUNT(*) n FROM trajectory");
    const afterProps = await pool.query("SELECT COUNT(*) n FROM prop");
    const withSamples = await pool.query(
      "SELECT COUNT(*) n FROM trajectory WHERE length(samples) > 2",
    );

    return NextResponse.json({
      engine: ENGINE,
      source: { trajectories: trajectories.length, props: props.length },
      copied: { trajectories: copiedTrajectories, props: copiedProps },
      target: {
        trajectories: Number(after.rows[0].n),
        props: Number(afterProps.rows[0].n),
        withSamples: Number(withSamples.rows[0].n),
      },
      live: ENGINE === "postgres" ? await count("SELECT COUNT(*) AS n FROM trajectory") : null,
    });
  } finally {
    lite.close();
    await pool.end();
  }
}

/** Only used when the app itself is not yet pointed at Postgres, so the app's
 *  own migration has not created these. Kept in step with lib/server/sql.ts. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS prop (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, role TEXT NOT NULL,
    width_mm DOUBLE PRECISION NOT NULL, bytes BIGINT NOT NULL, sha256 TEXT NOT NULL,
    uploader TEXT NOT NULL, created_at BIGINT NOT NULL, glb BYTEA NOT NULL);
  CREATE TABLE IF NOT EXISTS trajectory (
    traj_hash TEXT PRIMARY KEY, task_id INTEGER NOT NULL, contributor TEXT NOT NULL,
    score INTEGER NOT NULL, deviation_mm DOUBLE PRECISION NOT NULL,
    duration_s DOUBLE PRECISION NOT NULL, placement DOUBLE PRECISION NOT NULL,
    efficiency DOUBLE PRECISION NOT NULL, smoothness DOUBLE PRECISION NOT NULL,
    sample_count INTEGER NOT NULL, samples TEXT NOT NULL, signature TEXT NOT NULL,
    created_at BIGINT NOT NULL, tx_hash TEXT, settled INTEGER NOT NULL DEFAULT 0,
    chain_id INTEGER, payload_ids TEXT);
  CREATE INDEX IF NOT EXISTS idx_traj_task ON trajectory(task_id);
  CREATE INDEX IF NOT EXISTS idx_traj_contributor ON trajectory(contributor);
  CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectory(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_traj_settled ON trajectory(settled);
  CREATE INDEX IF NOT EXISTS idx_traj_chain ON trajectory(chain_id);
`;

export const POST = logged("/api/migrate", handlePOST);
