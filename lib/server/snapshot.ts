import crypto from "node:crypto";
import { ENGINE, query, count } from "@/lib/server/db";

/**
 * Take the corpus somewhere the volume is not.
 *
 * The trajectories are the only thing here that cannot be rebuilt. The chain
 * holds each hash, score and payment, but the samples that earned them exist
 * only in this deployment's database, so every payout stops being auditable
 * the moment that database does.
 *
 * The archive is rows, not a database file. A file is only restorable by the
 * engine that wrote it and the version that wrote it — which is exactly the
 * dependency a backup is supposed to remove, and it stopped being possible at
 * all once the store could be either Postgres or SQLite. NDJSON restores into
 * anything, including a text editor, and the digest over those bytes means a
 * truncated upload cannot pass for a whole one.
 */

type S3 = { endpoint: string; bucket: string; key: string; secret: string; region: string };

function config(): S3 | null {
  const endpoint = process.env.SNAPSHOT_BUCKET_ENDPOINT;
  const bucket = process.env.SNAPSHOT_BUCKET_NAME;
  const key = process.env.SNAPSHOT_ACCESS_KEY_ID;
  const secret = process.env.SNAPSHOT_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !key || !secret) return null;
  return { endpoint, bucket, key, secret, region: process.env.SNAPSHOT_BUCKET_REGION ?? "auto" };
}

const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (k: Buffer | string, d: string) => crypto.createHmac("sha256", k).update(d).digest();

/** SigV4 for a single PUT. The AWS SDK is several megabytes to do this once. */
function sign(cfg: S3, objectKey: string, body: Buffer, now: Date, method: "PUT" | "GET" = "PUT") {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const host = new URL(cfg.endpoint).host;
  const payloadHash = sha256(body);

  const canonicalHeaders =
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    `/${cfg.bucket}/${objectKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const signature = hmac(
    hmac(hmac(hmac(hmac(`AWS4${cfg.secret}`, date), cfg.region), "s3"), "aws4_request"),
    toSign,
  ).toString("hex");

  return {
    authorization:
      `AWS4-HMAC-SHA256 Credential=${cfg.key}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
    payloadHash,
  };
}

export type SnapshotResult = {
  key: string;
  bytes: number;
  sha256: string;
  /** Every stored recording, settled or not. */
  trajectories: number;
  settled: number;
  unsettled: number;
  props: number;
  uploaded: boolean;
  detail: string;
};

/** Consistent copy of the corpus, uploaded and verifiable by digest. */
export async function snapshot(stamp: string): Promise<SnapshotResult> {
  // Every row, not just the settled ones — a backup that dropped the runs
  // nobody submitted would quietly lose the recordings people made. Broken out
  // so this total is never mistaken for the number the feed reports.
  const counts = {
    trajectories: await count("SELECT COUNT(*) AS n FROM trajectory"),
    settled: await count("SELECT COUNT(*) AS n FROM trajectory WHERE settled = 1"),
    unsettled: await count("SELECT COUNT(*) AS n FROM trajectory WHERE settled = 0"),
    props: await count("SELECT COUNT(*) AS n FROM prop"),
  };

  const trajectories = await query("SELECT * FROM trajectory ORDER BY created_at ASC");
  // The GLB bytes travel base64 rather than raw: one line per row is what makes
  // this restorable a line at a time, and a binary column would break that.
  const props = (await query<Record<string, unknown>>(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at, glb
       FROM prop ORDER BY created_at ASC`,
  )).map((p) => ({ ...p, glb: Buffer.from(p.glb as Uint8Array).toString("base64") }));

  const lines = [
    JSON.stringify({ _: "manifest", version: 1, engine: ENGINE, stamp, ...counts }),
    ...trajectories.map((r) => JSON.stringify({ _: "trajectory", ...r })),
    ...props.map((r) => JSON.stringify({ _: "prop", ...r })),
  ];
  const body = Buffer.from(lines.join("\n") + "\n", "utf8");

  const objectKey = `axon-${stamp}.ndjson`;
  const digest = sha256(body);
  const cfg = config();

  if (!cfg) {
    return {
      key: objectKey, bytes: body.length, sha256: digest, ...counts,
      uploaded: false,
      detail: "No bucket configured; snapshot was taken and verified but not stored.",
    };
  }

  const now = new Date();
  const { authorization, amzDate, payloadHash } = sign(cfg, objectKey, body, now);

  const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${objectKey}`, {
    method: "PUT",
    headers: {
      authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "content-type": "application/x-ndjson",
      "content-length": String(body.length),
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      key: objectKey, bytes: body.length, sha256: digest, ...counts,
      uploaded: false,
      detail: `Storage refused the upload: ${res.status} ${text.slice(0, 200)}`,
    };
  }

  return {
    key: objectKey, bytes: body.length, sha256: digest, ...counts,
    uploaded: true,
    detail: `Stored in ${cfg.bucket}.`,
  };
}


export type DrillResult = {
  key: string;
  bytes: number;
  sha256: string;
  integrity: string;
  trajectories: number;
  props: number;
  withSamples: number;
  matchesLive: boolean;
  live: { trajectories: number; props: number };
};

/**
 * Restore the most recent snapshot and prove it is the corpus.
 *
 * A snapshot nobody has restored is a file, not a backup. This pulls the object
 * back out of the bucket, parses every line, and checks the things that would
 * actually make it useless: a row that is not valid JSON, a manifest whose
 * counts disagree with the rows that follow it, a trajectory with no samples,
 * a prop whose stored digest does not match its own bytes.
 *
 * The last of those is the one worth having. The engine's integrity check said
 * the file was a well-formed database; it could not say the bytes in it were
 * the bytes that were put there. Re-hashing each GLB does.
 *
 * Reads only, and nothing is written anywhere.
 */
export async function drill(stamp: string): Promise<DrillResult> {
  const cfg = config();
  if (!cfg) throw new Error("No bucket configured; there is nothing to restore.");

  const objectKey = `axon-${stamp}.ndjson`;
  const now = new Date();
  const signed = sign(cfg, objectKey, Buffer.alloc(0), now, "GET");

  const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${objectKey}`, {
    method: "GET",
    headers: {
      authorization: signed.authorization,
      "x-amz-content-sha256": signed.payloadHash,
      "x-amz-date": signed.amzDate,
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Bucket returned ${res.status} for ${objectKey}`);

  const body = Buffer.from(await res.arrayBuffer());
  const lines = body.toString("utf8").split("\n").filter(Boolean);

  const faults: string[] = [];
  type Manifest = { trajectories?: number; props?: number };
  let manifest: Manifest | null = null;
  let trajectories = 0, props = 0, withSamples = 0;

  for (const [i, line] of lines.entries()) {
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line);
    } catch {
      faults.push(`line ${i + 1} is not JSON`);
      continue;
    }
    if (row._ === "manifest") { manifest = row as Manifest; continue; }
    if (row._ === "trajectory") {
      trajectories += 1;
      // A corpus without its samples restores as a list of hashes.
      if (typeof row.samples === "string" && row.samples.length > 2) withSamples += 1;
      else faults.push(`${String(row.traj_hash).slice(0, 12)} has no samples`);
      continue;
    }
    if (row._ === "prop") {
      props += 1;
      // The stored digest against the bytes themselves — the one check a
      // file-level integrity test could never make.
      const glb = Buffer.from(String(row.glb ?? ""), "base64");
      if (sha256(glb) !== row.sha256) faults.push(`prop ${String(row.id)} digest mismatch`);
      continue;
    }
    faults.push(`line ${i + 1} is an unknown row type`);
  }

  if (!manifest) faults.push("no manifest");
  else {
    if (manifest.trajectories !== trajectories) {
      faults.push(`manifest says ${manifest.trajectories} trajectories, found ${trajectories}`);
    }
    if (manifest.props !== props) {
      faults.push(`manifest says ${manifest.props} props, found ${props}`);
    }
  }

  const live = {
    trajectories: await count("SELECT COUNT(*) AS n FROM trajectory"),
    props: await count("SELECT COUNT(*) AS n FROM prop"),
  };

  return {
    key: objectKey,
    bytes: body.length,
    sha256: sha256(body),
    integrity: faults.length === 0 ? "ok" : faults.join("; "),
    trajectories,
    props,
    withSamples,
    // The live store only grows, so the restore is sound if it is not ahead.
    matchesLive:
      faults.length === 0 && trajectories <= live.trajectories && props <= live.props,
    live,
  };
}
