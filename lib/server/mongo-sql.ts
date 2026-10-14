import "server-only";
import Database from "better-sqlite3";
import { Binary, MongoClient } from "mongodb";

/** Small-demo bridge: SQL executes in memory, durable snapshots live in Atlas.
 * A versioned compare-and-swap prevents lost writes across Vercel instances.
 * No filesystem persistence or process-local write acknowledgement is used.
 * Postgres remains the preferred store for larger corpora (12 MiB limit here).
 */
let client: MongoClient | undefined;
let connected: Promise<MongoClient> | undefined;
const MAX_BYTES = 12 * 1024 * 1024;
type Snapshot = { _id: string; version: number; image: Binary };

export async function mongoSql(
  sql: string,
  params: unknown[],
  write: boolean,
  migrate: (db: Database.Database) => void,
): Promise<unknown[]> {
  const name = process.env.MONGODB_DB || "arc_thenar_testnet";
  if (!/^arc_[a-z0-9_]+$/.test(name)) throw new Error("MONGODB_DB must use an arc_ prefix");
  client ??= new MongoClient(process.env.MONGODB_URI!, {
    maxPoolSize: 3, serverSelectionTimeoutMS: 10_000,
  });
  connected ??= client.connect().catch(async error => {
    const failed = client;
    client = undefined;
    connected = undefined;
    await failed?.close().catch(() => {});
    throw error;
  });
  const active = await connected;
  const snapshots = active.db(name).collection<Snapshot>("sql_snapshots");
  for (let attempt = 0; attempt < 24; attempt++) {
    const current = await snapshots.findOne({ _id: "corpus" });
    const db = new Database(current ? Buffer.from(current.image.buffer) : ":memory:");
    try {
      migrate(db);
      const stmt = db.prepare(sql);
      if (!write) {
        if (!stmt.readonly) throw new Error("Read query must not mutate storage");
        return stmt.all(...params);
      }
      stmt.run(...params);
      const image = db.serialize();
      if (image.byteLength > MAX_BYTES) throw new Error("Corpus exceeded the Atlas snapshot limit; configure Postgres DATABASE_URL before accepting more recordings.");
      const next: Snapshot = { _id: "corpus", version: (current?.version ?? 0) + 1, image: new Binary(image) };
      if (current) {
        const result = await snapshots.replaceOne({ _id: "corpus", version: current.version }, next);
        if (result.modifiedCount === 1) return [];
      } else {
        try { await snapshots.insertOne(next); return []; }
        catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
      }
    } finally { db.close(); }
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 50));
  }
  throw new Error("Corpus is busy; retry the request.");
}

export async function closeMongoSql(): Promise<void> {
  await client?.close();
  client = undefined;
  connected = undefined;
}
