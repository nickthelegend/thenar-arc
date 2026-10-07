/**
 * Restore a snapshot into a database, and prove it landed.
 *
 * The daily snapshot has been exported and integrity-checked for a while, but
 * nothing had ever written one back. An export nobody has restored is not a
 * backup — it is a file with a checksum. This closes that: it reads the
 * newline-delimited snapshot, inserts every row, and then verifies the result
 * against the manifest the snapshot carries.
 *
 * The target is named explicitly and defaults to a scratch file, so rehearsing
 * cannot touch the live corpus by being run in the wrong directory.
 *
 *   node scripts/restore.mjs <snapshot.ndjson> [--into <path>]
 *   node scripts/restore.mjs --rehearse       export the local db, restore it, verify
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const args = process.argv.slice(2);
const rehearse = args.includes("--rehearse");
const intoAt = args.indexOf("--into");
const SCRATCH = "/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-monad-blitz/c4afa5c0-ea5d-456c-bee5-d383c3d34809/scratchpad/restore";
const into = intoAt >= 0 ? args[intoAt + 1] : path.join(SCRATCH, "restored.db");

function schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trajectory (
      traj_hash TEXT PRIMARY KEY, task_id INTEGER NOT NULL, contributor TEXT NOT NULL,
      score INTEGER, deviation_mm REAL, duration_s REAL, sample_count INTEGER,
      samples TEXT, created_at INTEGER, settled INTEGER DEFAULT 0, tx_hash TEXT, chain_id INTEGER, cid TEXT);
    CREATE TABLE IF NOT EXISTS prop (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, role TEXT NOT NULL, width_mm REAL,
      bytes INTEGER, sha256 TEXT, uploader TEXT, created_at INTEGER, glb BLOB);
  `);
}

/** Write a snapshot out of a SQLite database, in the shape lib/server/snapshot.ts emits. */
function exportFrom(dbPath, out) {
  const db = new Database(dbPath, { readonly: true });
  const traj = db.prepare("SELECT * FROM trajectory ORDER BY created_at ASC").all();
  let props = [];
  try { props = db.prepare("SELECT * FROM prop ORDER BY created_at ASC").all(); } catch { /* table may not exist */ }
  const lines = [
    JSON.stringify({ _: "manifest", version: 1, engine: "sqlite", stamp: "rehearsal",
                     trajectories: traj.length, props: props.length }),
    ...traj.map((t) => JSON.stringify({ _: "trajectory", ...t })),
    ...props.map((p) => JSON.stringify({ _: "prop", ...p, glb: Buffer.from(p.glb ?? Buffer.alloc(0)).toString("base64") })),
  ];
  writeFileSync(out, lines.join("\n") + "\n");
  db.close();
  return { trajectories: traj.length, props: props.length, bytes: Buffer.byteLength(lines.join("\n")) };
}

function restore(file, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  rmSync(target, { force: true });
  const db = new Database(target);
  schema(db);

  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  let manifest = null, traj = 0, props = 0;
  const faults = [];

  const insT = db.prepare(`INSERT OR REPLACE INTO trajectory
    (traj_hash,task_id,contributor,score,deviation_mm,duration_s,sample_count,samples,created_at,settled,tx_hash,chain_id,cid)
    VALUES (@traj_hash,@task_id,@contributor,@score,@deviation_mm,@duration_s,@sample_count,@samples,@created_at,@settled,@tx_hash,@chain_id,@cid)`);
  const insP = db.prepare(`INSERT OR REPLACE INTO prop
    (id,label,role,width_mm,bytes,sha256,uploader,created_at,glb)
    VALUES (@id,@label,@role,@width_mm,@bytes,@sha256,@uploader,@created_at,@glb)`);

  const tx = db.transaction(() => {
    for (const [i, line] of lines.entries()) {
      let row; try { row = JSON.parse(line); } catch { faults.push(`line ${i + 1} not JSON`); continue; }
      if (row._ === "manifest") { manifest = row; continue; }
      if (row._ === "trajectory") {
        const { _, ...r } = row;
        insT.run({ score: null, deviation_mm: null, duration_s: null, sample_count: null,
                   samples: null, settled: 0, tx_hash: null, chain_id: null, cid: null, ...r });
        traj += 1; continue;
      }
      if (row._ === "prop") {
        const glb = Buffer.from(String(row.glb ?? ""), "base64");
        // The digest is checked against the bytes, not trusted from the row.
        if (row.sha256 && sha256(glb) !== row.sha256) faults.push(`prop ${row.id} digest mismatch`);
        const { _, glb: __, ...r } = row;
        insP.run({ width_mm: null, bytes: glb.length, sha256: null, uploader: null, created_at: null, ...r, glb });
        props += 1; continue;
      }
      faults.push(`line ${i + 1} unknown row type`);
    }
  });
  tx();

  const got = {
    trajectories: db.prepare("SELECT COUNT(*) n FROM trajectory").get().n,
    props: db.prepare("SELECT COUNT(*) n FROM prop").get().n,
  };
  db.close();

  if (!manifest) faults.push("no manifest");
  else {
    if (manifest.trajectories !== got.trajectories) faults.push(`manifest ${manifest.trajectories} trajectories, restored ${got.trajectories}`);
    if (manifest.props !== got.props) faults.push(`manifest ${manifest.props} props, restored ${got.props}`);
  }
  return { manifest, parsed: { traj, props }, restored: got, faults, target };
}

if (rehearse) {
  mkdirSync(SCRATCH, { recursive: true });
  const src = process.env.AXON_DB_PATH ?? ".data/axon.db";
  if (!existsSync(src)) { console.error(`no database at ${src}`); process.exit(1); }
  const snap = path.join(SCRATCH, "rehearsal.ndjson");
  const e = exportFrom(src, snap);
  console.log(`  exported  ${e.trajectories} trajectories, ${e.props} props, ${(e.bytes/1024).toFixed(0)} KB`);
  const r = restore(snap, into);
  console.log(`  restored  ${r.restored.trajectories} trajectories, ${r.restored.props} props -> ${r.target}`);
  console.log(`  manifest  ${r.manifest.trajectories} / ${r.manifest.props}`);
  console.log(`  faults    ${r.faults.length}${r.faults.length ? " — " + r.faults.slice(0,3).join("; ") : ""}`);
  const ok = r.faults.length === 0 && r.restored.trajectories === e.trajectories;
  console.log(`\n  ${ok ? "restore rehearsal PASSED" : "restore rehearsal FAILED"}`);
  process.exit(ok ? 0 : 1);
}

const file = args[0];
if (!file) { console.error("usage: node scripts/restore.mjs <snapshot.ndjson> [--into <path>]  |  --rehearse"); process.exit(1); }
const r = restore(file, into);
console.log(JSON.stringify(r, null, 1));
process.exit(r.faults.length === 0 ? 0 : 1);
