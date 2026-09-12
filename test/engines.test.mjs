import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The two engines have to answer the same queries.
 *
 * lib/server/sql.ts says the engine is chosen once "and nothing silently"
 * differs after that. Two tables said otherwise: `annotation` and
 * `policy_submission` were created in the Postgres branch and not the SQLite
 * one, so /api/policy and the annotation routes returned 500 against every
 * SQLite database — new or old — and nothing caught it, because the tests and
 * the deployment both ran on Postgres.
 *
 * Asserted against the source rather than by opening a database, so it holds
 * without a Postgres to hand and fails on the commit that introduces the drift
 * rather than on the deploy that exposes it.
 */
const sql = readFileSync(new URL("../lib/server/sql.ts", import.meta.url), "utf8");

/**
 * The migration's own two halves.
 *
 * `lite()` is called from several accessors, so the boundary is the one inside
 * migrate() — the last of them — not the first in the file.
 */
const migrateFn = sql.indexOf("export function migrate(");
assert.ok(migrateFn > 0, "could not find migrate()");
const migrateAt = sql.indexOf('if (ENGINE === "postgres") {', migrateFn);
const split = sql.lastIndexOf("const db = await lite();");
assert.ok(migrateAt > migrateFn && split > migrateAt, "could not find the two branches of migrate()");
const postgres = sql.slice(migrateAt, split);
const sqlite = sql.slice(split);

/** Comments in this file discuss `CREATE TABLE IF NOT EXISTS` in prose, so a
 *  naive match picks the next word out of a sentence. Only real statements. */
const tablesIn = (text) =>
  new Set(
    [...text
      .split("\n")
      .filter((l) => !/^\s*(--|\/\/|\*)/.test(l))
      .join("\n")
      .matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/g)].map((m) => m[1]),
  );

test("every table the postgres migration creates exists in the sqlite one", () => {
  const missing = [...tablesIn(postgres)].filter((t) => !tablesIn(sqlite).has(t));
  assert.deepEqual(missing, [], `sqlite is missing: ${missing.join(", ")}`);
});

test("and the reverse, so neither engine grows a table the other lacks", () => {
  const missing = [...tablesIn(sqlite)].filter((t) => !tablesIn(postgres).has(t));
  assert.deepEqual(missing, [], `postgres is missing: ${missing.join(", ")}`);
});

test("the tables the app actually queries are in both", () => {
  for (const t of ["trajectory", "prop", "annotation", "policy_submission", "note", "collaborator", "pageview", "pushsub"]) {
    assert.ok(tablesIn(postgres).has(t), `postgres has no ${t}`);
    assert.ok(tablesIn(sqlite).has(t), `sqlite has no ${t}`);
  }
});

/**
 * The endpoints the app reads from and the origins it is allowed to reach.
 *
 * These are two lists in two files, and they went out of step the moment the
 * second and third RPC were added: the browser refused every request to them
 * and the entire page sweep went red. The policy was right and the omission
 * was mine, which is exactly the pair worth asserting.
 */
const chain = readFileSync(new URL("../lib/chain.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("every RPC endpoint is allowed by the content security policy", () => {
  // Ends at `] as const`, not at the first bracket: the first entry is
  // `avalancheFuji.rpcUrls.default.http[0]`, whose own bracket would cut the
  // list off before the literals this is here to check.
  const from = chain.indexOf("export const RPC_ENDPOINTS");
  const block = chain.slice(from, chain.indexOf("] as const;", from));
  const hosts = [...block.matchAll(/https:\/\/([^"'\s/]+)/g)].map((m) => m[1]);
  assert.ok(hosts.length >= 2, `expected the fallback list, found ${hosts.length}`);
  for (const h of hosts) {
    assert.ok(config.includes(h), `connect-src does not allow ${h}`);
  }
});
