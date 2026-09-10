import "server-only";
import { appChain } from "@/lib/chain";
import { migrate, query, queryOne, run, count, ENGINE, backfillContracts } from "@/lib/server/sql";
import { AXON_ADDRESS, PRIOR_CONTRACTS } from "@/lib/chain";

export { ENGINE, query, queryOne, count, run } from "@/lib/server/sql";

/**
 * Trajectory store.
 *
 * The chain holds the hash, the score and the payment. It cannot hold the
 * trajectory itself — a 20 Hz recording of a two-minute run is tens of
 * kilobytes, and there are meant to be millions of them. This is where the
 * actual data lives, addressed by the same hash the chain records, so any
 * payout can be recomputed from the artefact that earned it.
 *
 * Every accessor is async because the store may be across a socket rather than
 * on the filesystem. That is the whole cost of not being one file on one disk,
 * and it is paid here rather than by each caller writing its own SQL.
 */

/** Called before every access. The promise is memoised, so this is one round
 *  trip on the first query and free afterwards. */
let backfilled: Promise<number> | null = null;
async function db() {
  await migrate();
  // Once per process, and only rows that have no answer yet.
  backfilled ??= backfillContracts(AXON_ADDRESS, PRIOR_CONTRACTS);
  await backfilled;
}

/** Only what the live contract accepted. A run settled against a superseded
 *  deployment is real and paid, but the current contract has never heard of
 *  it, and a feed that mixed them would report a count the chain would deny. */
const HERE = () => AXON_ADDRESS.toLowerCase();

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
  contract: string | null;
};

export async function insertTrajectory(
  row: Omit<StoredTrajectory, "tx_hash" | "chain_id" | "contract">,
): Promise<void> {
  await db();
  // Re-scoring the same recording must not create a second row, and must not
  // fail either: the verifier hands back the signature it already issued.
  await run(
    `INSERT INTO trajectory
       (traj_hash, task_id, contributor, score, deviation_mm, duration_s,
        placement, efficiency, smoothness, sample_count, samples, signature,
        created_at, chain_id, payload_ids, contract)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (traj_hash) DO NOTHING`,
    [
      row.traj_hash, row.task_id, row.contributor, row.score, row.deviation_mm,
      row.duration_s, row.placement, row.efficiency, row.smoothness,
      row.sample_count, row.samples, row.signature, row.created_at,
      appChain.id, row.payload_ids ?? null, HERE(),
    ],
  );
}

export async function getTrajectory(hash: string): Promise<StoredTrajectory | undefined> {
  await db();
  return queryOne<StoredTrajectory>(`SELECT * FROM trajectory WHERE traj_hash = ?`, [hash]);
}

/** Only ever called once the receipt has been read back as successful. */
export async function markSettled(hash: string, txHash: string): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET tx_hash = ?, settled = 1 WHERE traj_hash = ?`, [txHash, hash]);
}

/** Rows whose settlement has not been established, oldest first. */
export async function unsettledWithTx(limit = 500) {
  await db();
  return query<{ traj_hash: string; tx_hash: string }>(
    `SELECT traj_hash, tx_hash FROM trajectory
      WHERE settled = 0 AND tx_hash IS NOT NULL LIMIT ?`,
    [limit],
  );
}

/** Drop a transaction that turned out not to have settled. */
export async function clearTx(hash: string): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET tx_hash = NULL, settled = 0 WHERE traj_hash = ?`, [hash]);
}

export async function recentTrajectories(limit = 20) {
  await db();
  return query<Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness" | "payload_ids">>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, tx_hash
       FROM trajectory WHERE settled = 1 AND chain_id = ? AND contract = ?
      ORDER BY created_at DESC LIMIT ?`,
    [appChain.id, HERE(), limit],
  );
}

export async function trajectoriesForTask(taskId: number, limit = 200) {
  await db();
  return query<{
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number; tx_hash: string | null;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, tx_hash
       FROM trajectory WHERE task_id = ? AND settled = 1 AND chain_id = ? AND contract = ?
      ORDER BY score DESC LIMIT ?`,
    [taskId, appChain.id, HERE(), limit],
  );
}

export async function countTrajectories(): Promise<number> {
  await db();
  return count(
    `SELECT COUNT(*) AS n FROM trajectory WHERE settled = 1 AND chain_id = ? AND contract = ?`,
    [appChain.id, HERE()],
  );
}

/** Settled rows whose chain has never been established. */
export async function unresolvedChain(limit = 500) {
  await db();
  return query<{ traj_hash: string; tx_hash: string }>(
    `SELECT traj_hash, tx_hash FROM trajectory
      WHERE chain_id IS NULL AND tx_hash IS NOT NULL LIMIT ?`,
    [limit],
  );
}

/** Record the chain a transaction was found on. Only ever called after a
 *  receipt for that exact hash came back from that exact chain. */
export async function setChainId(hash: string, chainId: number): Promise<void> {
  await db();
  await run(`UPDATE trajectory SET chain_id = ? WHERE traj_hash = ?`, [chainId, hash]);
}

/** How the stored runs divide across chains, for the integrity check. */
export async function countByChain() {
  await db();
  const rows = await query<{ chain_id: number | null; n: number | string }>(
    `SELECT chain_id, COUNT(*) AS n FROM trajectory
      WHERE settled = 1 GROUP BY chain_id ORDER BY COUNT(*) DESC`,
  );
  return rows.map((r) => ({ chain_id: r.chain_id, n: Number(r.n) }));
}

/**
 * Every attempt at a task, not only the ones that were paid for.
 *
 * The task page says a pass rate is not knowable because a run that misses the
 * datum is never written to the chain. The first half is true and the second
 * hid something: the verifier scores every run it is sent and stores it either
 * way, so the misses have been on file the whole time with `settled = 0`. What
 * was missing was the distinction between two very different rows that both
 * look unsettled — a run that scored too low to be paid, and a run that scored
 * well and whose operator never signed the transaction.
 *
 * The first is a failure and is the scarcest thing in manipulation data. The
 * second is an abandonment and says nothing about the task. Counting them
 * together would produce a pass rate that moves when somebody closes a tab.
 */
export async function attemptsForTask(taskId: number, floor: number, limit = 400) {
  await db();
  return query<{
    traj_hash: string; contributor: string; score: number;
    deviation_mm: number; duration_s: number; created_at: number;
    settled: number; outcome: string;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s, created_at, settled,
            CASE WHEN settled = 1 THEN 'paid'
                 WHEN score < ? THEN 'failed'
                 ELSE 'unsubmitted' END AS outcome
       FROM trajectory
      WHERE task_id = ? AND chain_id = ? AND contract = ?
      ORDER BY created_at DESC LIMIT ?`,
    [floor, taskId, appChain.id, HERE(), limit],
  );
}

/**
 * The paid runs of a task, with their samples, for comparing a new one against.
 *
 * Settled only, and that restriction is the point. An unsettled row is often
 * the same operator's previous attempt at the very run they are submitting now
 * — they verified, the wallet prompt was refused, they tried again — and
 * refusing that as a duplicate would punish the one recovery path the flow
 * has. What must not happen twice is being *paid* twice, so the comparison is
 * against what was paid.
 */
export async function settledSamplesForTask(taskId: number, limit = 50) {
  await db();
  return query<{ traj_hash: string; samples: string }>(
    `SELECT traj_hash, samples FROM trajectory
      WHERE task_id = ? AND settled = 1 AND chain_id = ? AND contract = ?
      ORDER BY created_at DESC LIMIT ?`,
    [taskId, appChain.id, HERE(), limit],
  );
}

/** The runs a buyer would want as negative examples: scored, recorded, and
 *  below the floor that pays. Never mixed into the paid corpus. */
export async function failedTrajectories(taskId: number, floor: number, limit = 200) {
  await db();
  return query<{
    traj_hash: string; contributor: string; score: number; deviation_mm: number;
    duration_s: number; sample_count: number; samples: string; created_at: number;
  }>(
    `SELECT traj_hash, contributor, score, deviation_mm, duration_s,
            sample_count, samples, created_at
       FROM trajectory
      WHERE task_id = ? AND settled = 0 AND score < ? AND chain_id = ? AND contract = ?
      ORDER BY created_at DESC LIMIT ?`,
    [taskId, floor, appChain.id, HERE(), limit],
  );
}

/** Runs recorded under a previous deployment, for the archive. */
export async function trajectoriesOnChain(chainId: number, limit = 500) {
  await db();
  return query<Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness" | "payload_ids">>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, tx_hash, chain_id
       FROM trajectory WHERE settled = 1 AND chain_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    [chainId, limit],
  );
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
 * The GLB itself goes in the row rather than on disk: the store is what
 * survives a redeploy, and a scene whose model went missing would make every
 * run recorded against it unreproducible.
 */
export async function insertProp(row: StoredProp & { glb: Buffer }): Promise<void> {
  await db();
  await run(
    `INSERT INTO prop (id, label, role, width_mm, bytes, sha256, uploader, created_at, glb)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [row.id, row.label, row.role, row.width_mm, row.bytes, row.sha256,
     row.uploader, row.created_at, row.glb],
  );
}

export async function getPropBlob(id: string): Promise<{ glb: Buffer; bytes: number } | undefined> {
  await db();
  const r = await queryOne<{ glb: Buffer | Uint8Array; bytes: number }>(
    "SELECT glb, bytes FROM prop WHERE id = ?", [id],
  );
  if (!r) return undefined;
  return { glb: Buffer.from(r.glb), bytes: Number(r.bytes) };
}

export async function listProps(limit = 200): Promise<StoredProp[]> {
  await db();
  return query<StoredProp>(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function propBySha(sha: string): Promise<StoredProp | undefined> {
  await db();
  return queryOne<StoredProp>(
    `SELECT id, label, role, width_mm, bytes, sha256, uploader, created_at
       FROM prop WHERE sha256 = ?`,
    [sha],
  );
}

/** Runs settled against a deployment that has since been superseded. */
export async function trajectoriesOnContract(address: string, limit = 500) {
  await db();
  return query<Omit<StoredTrajectory, "samples" | "signature" | "placement" | "efficiency" | "smoothness" | "payload_ids">>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, tx_hash, chain_id, contract
       FROM trajectory WHERE settled = 1 AND contract = ?
      ORDER BY created_at DESC LIMIT ?`,
    [address.toLowerCase(), limit],
  );
}

/**
 * Every episode this deployment holds, across every task.
 *
 * The task pages answer "what is in this task"; nothing answered "what is in
 * the corpus". A buyer deciding whether any of this is worth licensing is
 * asking the second question, and had to visit six pages and add up.
 *
 * Failures are included and labelled rather than filtered out, because the
 * point of keeping them was that somebody might want them — a search that
 * silently omits them is the old survivorship filter with extra steps.
 */
export async function corpusIndex(opts: {
  outcome?: "paid" | "failed" | "unsubmitted" | "all";
  /** The acceptance floor, needed to tell a failure from an abandonment. */
  floor: number;
  taskId?: number;
  minScore?: number;
  limit?: number;
}) {
  await db();
  const floor = opts.minScore ?? 0;
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));

  const where: string[] = ["chain_id = ?", "contract = ?"];
  const args: (string | number)[] = [appChain.id, HERE()];

  // The three outcomes have to filter the way they are labelled. "settled = 0"
  // alone is both a failure and an abandonment, and using it for "failed"
  // returned every unsent run under a heading that said below the floor.
  if (opts.outcome === "paid") where.push("settled = 1");
  if (opts.outcome === "failed") { where.push("settled = 0 AND score < ?"); args.push(opts.floor); }
  if (opts.outcome === "unsubmitted") { where.push("settled = 0 AND score >= ?"); args.push(opts.floor); }
  if (typeof opts.taskId === "number") { where.push("task_id = ?"); args.push(opts.taskId); }
  if (floor > 0) { where.push("score >= ?"); args.push(floor); }

  args.push(limit);
  return query<{
    traj_hash: string; task_id: number; contributor: string; score: number;
    deviation_mm: number; duration_s: number; sample_count: number;
    created_at: number; settled: number; tx_hash: string | null;
  }>(
    `SELECT traj_hash, task_id, contributor, score, deviation_mm, duration_s,
            sample_count, created_at, settled, tx_hash
       FROM trajectory
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT ?`,
    args,
  );
}

// ------------------------------------------------------- policy submissions

export type PolicySubmission = {
  weights_hash: string; submitter: string; label: string;
  grasped: number; placed: number; median_mm: number; starts: number;
  created_at: number;
};

/**
 * Record a policy and what it scored.
 *
 * Keyed by the hash of the weights, so submitting the same model twice is the
 * same entry rather than two — the leaderboard ranks models, not submissions,
 * and a model does not get better by being sent again.
 */
export async function insertPolicy(row: PolicySubmission & { weights: string }): Promise<void> {
  await db();
  await run(
    `INSERT INTO policy_submission
       (weights_hash, submitter, label, grasped, placed, median_mm, starts, weights, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT (weights_hash) DO NOTHING`,
    [row.weights_hash, row.submitter, row.label, row.grasped, row.placed,
     row.median_mm, row.starts, row.weights, row.created_at],
  );
}

export async function policyByHash(hash: string) {
  await db();
  return queryOne<PolicySubmission & { weights: string }>(
    `SELECT * FROM policy_submission WHERE weights_hash = ?`, [hash],
  );
}

/** Best first: placed, then grasped, then how close the misses were. */
export async function policyLeaderboard(limit = 100) {
  await db();
  return query<PolicySubmission>(
    `SELECT weights_hash, submitter, label, grasped, placed, median_mm, starts, created_at
       FROM policy_submission
      ORDER BY placed DESC, grasped DESC, median_mm ASC, created_at ASC
      LIMIT ?`,
    [limit],
  );
}

// ------------------------------------------------------------- annotations

/**
 * What the operator says happened on one run.
 *
 * The task instruction says what was asked. This says what the person driving
 * it actually did — "came in too flat and had to re-seat it" — which is the
 * kind of language a text-conditioned policy needs and which exists nowhere
 * else in the record. The samples say where the arm went; they do not say the
 * operator meant to correct.
 *
 * One per run, replaceable by its author. A second sentence about the same
 * recording is a correction, not a second opinion.
 */
export async function upsertAnnotation(row: {
  traj_hash: string; author: string; body: string; signature: string; created_at: number;
}): Promise<void> {
  await db();
  await run(
    `INSERT INTO annotation (traj_hash, author, body, signature, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT (traj_hash) DO UPDATE
       SET body = EXCLUDED.body,
           signature = EXCLUDED.signature,
           created_at = EXCLUDED.created_at`,
    [row.traj_hash, row.author.toLowerCase(), row.body, row.signature, row.created_at],
  );
}

export async function annotationFor(hash: string) {
  await db();
  return queryOne<{ traj_hash: string; author: string; body: string; signature: string; created_at: number }>(
    `SELECT * FROM annotation WHERE traj_hash = ?`, [hash],
  );
}

/** Every annotation on a task's runs, for shipping with the corpus. */
export async function annotationsForTask(taskId: number) {
  await db();
  return query<{ traj_hash: string; author: string; body: string }>(
    `SELECT a.traj_hash, a.author, a.body
       FROM annotation a
       JOIN trajectory t ON t.traj_hash = a.traj_hash
      WHERE t.task_id = ? AND t.chain_id = ? AND t.contract = ?`,
    [taskId, appChain.id, HERE()],
  );
}
