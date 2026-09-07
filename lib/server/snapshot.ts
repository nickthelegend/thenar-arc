import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "@/lib/server/db";

/**
 * Take the corpus somewhere the volume is not.
 *
 * The trajectories are the only thing here that cannot be rebuilt. The chain
 * holds each hash, score and payment, but the samples that earned them exist in
 * one SQLite file on one Railway volume, so every payout stops being auditable
 * the moment that volume does.
 *
 * The copy is made with VACUUM INTO rather than by reading the file: under WAL
 * the file on disk is not a consistent database on its own, and a backup that
 * restores to a corrupt page is worse than none because it is believed.
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
function sign(cfg: S3, objectKey: string, body: Buffer, now: Date) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const host = new URL(cfg.endpoint).host;
  const payloadHash = sha256(body);

  const canonicalHeaders =
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
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
  const db = getDb();
  const tmp = path.join(os.tmpdir(), `axon-${stamp}.db`);
  fs.rmSync(tmp, { force: true });

  // Consistent as of this moment, WAL and all.
  db.prepare("VACUUM INTO ?").run(tmp);

  const body = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });

  // Every row, not just the settled ones — a backup that dropped the runs
  // nobody submitted would quietly lose the recordings people made. Broken out
  // so this total is never mistaken for the number the feed reports.
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const counts = {
    trajectories: one("SELECT COUNT(*) n FROM trajectory"),
    settled: one("SELECT COUNT(*) n FROM trajectory WHERE settled = 1"),
    unsettled: one("SELECT COUNT(*) n FROM trajectory WHERE settled = 0"),
    props: one("SELECT COUNT(*) n FROM prop"),
  };

  const objectKey = `axon-${stamp}.db`;
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
      "content-type": "application/x-sqlite3",
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
