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

  // The key lives in the signer service. Asserted from outside as well as by
  // the health check itself, because a health check that reports on its own
  // process is exactly what a key drifting back into this one would defeat:
  // the public edge must not be able to sign, whatever it says about itself.
  check("web service reports no signing key", health.checks.keyIsolation?.ok === true,
    health.checks.keyIsolation?.detail);
  // The share card 404'd in production once while passing every local check —
  // it built, it was in the routes manifest, and the deployed host served
  // nothing. Only a request to the deployed host can tell.
  const og = await fetch(`${BASE}/og.png`);
  const ogBytes = og.ok ? Buffer.from(await og.arrayBuffer()) : Buffer.alloc(0);
  check("share card serves a real PNG",
    og.status === 200 &&
      og.headers.get("content-type")?.startsWith("image/png") === true &&
      ogBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${og.status} ${og.headers.get("content-type")} ${ogBytes.length}b`);

  const home = await (await fetch(BASE)).text();
  check("og:image resolves to an absolute URL",
    /<meta property="og:image" content="https:\/\/[^"]+\/og\.png"/.test(home));

  // The read API is public, and "public" here means callable from another
  // origin — not merely unauthenticated. Both halves are asserted: the header
  // that lets a browser read, and the absence of the ones that would let it
  // write.
  const cat = await fetch(`${BASE}/api`);
  const catBody = cat.ok ? await cat.json() : {};
  check("api catalogue lists its endpoints",
    cat.status === 200 && Array.isArray(catBody.endpoints) && catBody.endpoints.length > 0,
    `${cat.status} ${catBody.endpoints?.length ?? 0}`);
  check("reads are open cross-origin",
    cat.headers.get("access-control-allow-origin") === "*",
    String(cat.headers.get("access-control-allow-origin")));

  const pre = await fetch(`${BASE}/api/hit`, {
    method: "OPTIONS",
    headers: {
      origin: "https://elsewhere.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  check("writes are not, by preflight",
    !pre.headers.get("access-control-allow-methods") && !pre.headers.get("access-control-allow-headers"),
    `methods=${pre.headers.get("access-control-allow-methods")} headers=${pre.headers.get("access-control-allow-headers")}`);

  const signGet = await fetch(`${BASE}/api/sign`);
  const signBody = await signGet.json().catch(() => ({}));
  check("public /api/sign holds no key", signGet.status === 503 && signBody.holdsKey === false,
    `${signGet.status} ${JSON.stringify(signBody)}`);
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

  // Every run on file re-hashes, not just the newest. A scene-carrying run
  // hashes as version 2 and a run whose instruction named its props still
  // hashes as version 1; if either serialisation drifted, the twelve payouts
  // that predate version 2 would stop matching the chain and this would fail.
  let v1 = 0, v2 = 0, broken = [];
  for (const r of feed.runs) {
    const t = await json(`/api/trajectory/${r.traj_hash}`);
    if (t.integrity?.matches !== true) broken.push(r.traj_hash.slice(0, 12));
    if (t.payloadIds?.length) v2 += 1; else v1 += 1;
    // A run that records a second payload must name both props, and one that
    // names two props must record both — a scene and its recording cannot
    // disagree about how many objects were in the room.
    const two = Boolean(t.samples?.[0]?.object2);
    if (two !== ((t.payloadIds?.length ?? 1) > 1)) {
      broken.push(`${r.traj_hash.slice(0, 12)} scene/recording mismatch`);
    }
  }
  check(`every stored run re-hashes (${v1} v1, ${v2} v2)`, broken.length === 0, broken.join(" "));
  check("version 1 runs are still on file", v1 > 0, `${v1}`);
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
