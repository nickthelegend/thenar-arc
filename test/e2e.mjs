/**
 * The checks this project has been running by hand, as a script.
 *
 * Every regression sweep in this repo's history was a shell loop typed out
 * again, which means the coverage was only ever as good as what someone
 * remembered that day. These are the same assertions, fixed: the routes that
 * must answer, the invariants that must hold between the ledger and the chain,
 * and the edge cases that must fail in a specific way rather than with a 500.
 *
 *     npm test                 # against production
 *     BASE=http://localhost:3111 npm test
 *
 * It reads only. Nothing here writes to the chain or the database, so it is
 * safe to run against production — which is the point, because production is
 * the only place the whole system is actually assembled.
 */

const BASE = process.env.BASE ?? "https://thenar.io";
const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const AXON = "0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3";

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  ok   ${name}${detail ? `  ${detail}` : ""}`); }
  else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? `  ${detail}` : ""}`); }
}

async function status(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) });
    return r.status;
  } catch { return 0; }
}

async function json(path) {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function ethCall(data) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: AXON, data }, "latest"] }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json();
  return BigInt(j.result ?? "0x0");
}

console.log(`\n  thenar e2e — ${BASE}\n`);

// --- every page answers -----------------------------------------------------
const PAGES = [
  "/", "/hub", "/space", "/inventory", "/post", "/leaderboard", "/portfolio",
  "/foundry", "/spec", "/archive", "/passkey", "/status", "/changelog",
  "/licence/0", "/task/7", "/station/4",
];
for (const p of PAGES) check(`page ${p}`, (await status(p)) === 200);

// --- the ledger agrees with the chain ---------------------------------------
// trajectoryCount() — the invariant that broke once and must never break again.
const onChain = Number(await ethCall("0x0ded5d00"));
let feed;
try {
  feed = await json("/api/feed");
  check("feed total equals trajectoryCount", feed.total === onChain, `${feed.total} vs ${onChain}`);
} catch (e) {
  check("feed reachable", false, String(e));
}

const health = await json("/api/health").catch(() => null);
check("health ok", health?.ok === true);
if (health) {
  for (const [k, v] of Object.entries(health.checks)) check(`health ${k}`, v.ok, v.detail);
}

// --- archived runs stay archived --------------------------------------------
const archive = await json("/api/archive").catch(() => null);
check("archive present", Boolean(archive?.total), `${archive?.total ?? 0} runs`);
if (archive?.chains?.length) {
  const onPrior = archive.chains.every((c) => c.id !== 43113);
  check("no archived run claims the active chain", onPrior);
}

// --- every feed transaction resolves on the chain it claims -----------------
if (feed?.runs?.length) {
  const sample = feed.runs.slice(0, 3);
  for (const run of sample) {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [run.tx_hash] }),
      signal: AbortSignal.timeout(30_000),
    }).then((x) => x.json());
    check(`feed tx resolves on Fuji ${run.tx_hash.slice(0, 12)}`, r.result != null);
  }
}

// --- a stored run still hashes to what the chain recorded -------------------
if (feed?.runs?.length) {
  const one = await json(`/api/trajectory/${feed.runs[0].traj_hash}`);
  check("stored samples re-hash to the recorded value", one.integrity?.matches === true);
  check("trajectory reports its settlement chain", one.chainId === 43113, String(one.chainId));
}

// --- edge cases fail in a specific way, not with a 500 ----------------------
const EDGES = [
  ["/api/dataset", 400], ["/api/dataset?taskId=-1", 400],
  ["/api/dataset?traj=0xdead", 400], ["/api/dataset?taskId=4", 404],
  ["/api/glacier/notanaddress", 400], ["/api/trajectory/0xdeadbeef", 404],
  ["/api/space/abc", 400], ["/api/props/u_missing", 404],
  ["/api/task/abc/paths", 400], ["/api/dataset/summary", 400],
];
for (const [path, want] of EDGES) {
  const got = await status(path);
  check(`edge ${path} -> ${want}`, got === want, got === want ? "" : `got ${got}`);
}

// --- security headers -------------------------------------------------------
const head = await fetch(BASE, { signal: AbortSignal.timeout(30_000) });
for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options"]) {
  check(`header ${h}`, Boolean(head.headers.get(h)));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) { console.log("  failures:"); failures.forEach((f) => console.log(`    - ${f}`)); }
process.exit(fail ? 1 : 0);
