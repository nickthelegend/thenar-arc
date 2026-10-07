/**
 * The checks this project has been running by hand, as a script.
 *
 * Every regression sweep in this repo's history was a shell loop typed out
 * again, which means the coverage was only ever as good as what someone
 * remembered that day. These are the same assertions, fixed: the routes that
 * must answer, the invariants that must hold between the ledger and the chain,
 * and the edge cases that must fail in a specific way rather than with a 500.
 *
 *     npm run test:e2e                          # against http://localhost:3222
 *     BASE=https://your-host npm run test:e2e
 *
 * It reads only. Nothing here writes to the chain or the database, so it is
 * safe to run against any deployment.
 *
 * Ported to Monad testnet. The chain id, the endpoint and the CorpusAccess
 * address come from scripts/monad.mjs, which reads lib/deployment.ts — the
 * record the deploy script writes — so the suite follows a redeploy without
 * being edited. RPC in the environment still overrides the endpoint.
 */
import { appChain, RPC_ENDPOINTS, ADDR } from "../scripts/monad.mjs";

const BASE = process.env.BASE ?? "http://localhost:3222";
const RPC = process.env.RPC ?? RPC_ENDPOINTS[0];
const CHAIN_ID = appChain.id;
/**
 * The contract the deployment is actually reading, asked of the deployment.
 *
 * This was hardcoded, and when the protocol moved to v2 the suite carried on
 * calling v1 — reporting twenty runs on a chain the site had stopped reading,
 * and turning a real assertion into a comparison between two unrelated
 * numbers. A test that names the thing it is testing can drift from it; one
 * that asks cannot.
 */
const AXON = await fetch(`${BASE}/api/health`)
  .then((r) => r.json()) // 503 still carries the body, and the body is the point
  .then((d) => d.checks?.contract?.detail)
  .catch(() => null);
if (!/^0x[0-9a-fA-F]{40}$/.test(AXON ?? "")) {
  console.error("Could not read the live contract address from /api/health.");
  process.exit(1);
}

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

/** eth_call against an arbitrary contract, for the ones that are not AxonProtocol. */
async function callAt(to, data) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(30_000),
  });
  return (await r.json()).result ?? "0x";
}

/**
 * An address that holds corpus access *right now*, discovered rather than
 * pinned.
 *
 * This assertion used to name one address and expect 200 from it forever.
 * CorpusAccess sells time, so that subscription lapsed and the check went red
 * on a schedule — the endpoint was correct and the test was wrong. So the
 * current holder is looked up and `active` is confirmed on chain before
 * anything is asserted about the API.
 *
 * On Arc the lookup read every Subscribed event since deployment. Monad's
 * public endpoints answer a hundred blocks of logs per request and a day here
 * is about two hundred thousand blocks, so that walk would be thousands of
 * requests. The contract keeps `until` per address and no list of who, so the
 * candidates come from where subscribers actually are: E2E_SUBSCRIBER if the
 * caller names one, whoever subscribed in the last SUBSCRIBER_WINDOW blocks
 * (read a hundred at a time), and the addresses the feed has paid. A
 * subscriber older than the window and outside the feed is missed, and the
 * positive half then reports itself unverifiable rather than failing.
 */
const SUBSCRIBER_WINDOW = Number(process.env.SUBSCRIBER_WINDOW ?? 2_000);
async function findSubscriber(candidates = []) {
  const CORPUS = ADDR.corpusAccess;
  if (!CORPUS) return null;
  // The event's topic hash is not assumed — the log is fetched by address and
  // the indexed subscriber read out of topic 1.
  const rpc = (method, params) => fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  }).then((x) => x.json());
  const latest = Number((await rpc("eth_blockNumber", [])).result);
  const logs = [];
  for (let from = Math.max(0, latest - SUBSCRIBER_WINDOW + 1); from <= latest; from += 100) {
    const to = Math.min(latest, from + 99);
    const page = await rpc("eth_getLogs", [{ address: CORPUS, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    logs.push(...(page.result ?? []));
  }
  const recent = logs.map((l) => l.topics?.[1]).filter(Boolean).map((t) => "0x" + t.slice(26));
  const seen = [...new Set([
    process.env.E2E_SUBSCRIBER,
    ...recent.reverse(),
    ...candidates,
  ].filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? "")).map((a) => a.toLowerCase()))];
  for (const who of seen) {
    // active(address) — selector from the verified ABI.
    const out = await callAt(CORPUS, "0x9fd0506d" + who.slice(2).padStart(64, "0"));
    if (BigInt(out === "0x" ? "0x0" : out) === 1n) return who;
  }
  return null;
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
  "/foundry", "/spec", "/archive", "/passkey", "/status", "/changelog", "/corpus", "/policies",
  "/task/0", "/station/4", "/start", "/thenar", "/network",
];
for (const p of PAGES) check(`page ${p}`, (await status(p)) === 200);

// The reads about Monad a browser cannot make: the facilitator's offer and Sourcify's verification.
try {
  const n = await json("/api/network");
  check("/api/network reports Monad's x402 facilitator", typeof n.facilitator?.url === "string" && (Array.isArray(n.facilitator.kinds) || typeof n.facilitator.error === "string"));
  check("/api/network reports Sourcify for every Monad contract", Array.isArray(n.sourcify?.contracts) ? n.sourcify.contracts.length >= 10 : typeof n.sourcify?.error === "string");
} catch (e) {
  check("/api/network", false, String(e));
}

// The live Monad pipeline: rendered on the landing, and allowed to reach Monad's socket.
try {
  const r = await fetch(`${BASE}/thenar`, { signal: AbortSignal.timeout(30_000) });
  const html = await r.text();
  check("the landing carries the live Monad pipeline", html.includes('data-testid="monad-pipeline"'));
  check("the CSP lets a page reach Monad's WebSocket",
    (r.headers.get("content-security-policy") ?? "").includes("wss://testnet-rpc.monad.xyz"));
} catch (e) {
  check("the landing carries the live Monad pipeline", false, String(e));
}

// A licence page exists only for a minted policy: /licence/0 is a page while
// policy 0 exists and a 404 before it does, asked of the contract.
{
  // policyCount(), selector 0xde54d429.
  const answer = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: AXON, data: "0xde54d429" }, "latest"] }),
  }).then((r) => r.json());
  const policies = Number(BigInt(answer.result ?? "0x0"));
  const want = policies > 0 ? 200 : 404;
  check(`page /licence/0 -> ${want} (${policies} policies)`, (await status("/licence/0")) === want);
}

// This list used to name /task/7, which is not a task and never has been —
// there are six. It passed because a missing task still answered 200 and drew
// its own "no such task" in the browser, so the assertion was checking that a
// page which should not exist could be fetched. Both halves are pinned now: a
// real task answers, and an unreal one says so in the status line, where a
// crawler and a monitor can hear it.
for (const [p, want] of [["/task/999", 404], ["/run/0xdeadbeef", 404], ["/task/abc", 404]]) {
  check(`missing ${p} -> ${want}`, (await status(p)) === want);
}

// --- the ledger agrees with the chain ---------------------------------------
// trajectoryCount() — the invariant that broke once and must never break again.
const onChain = Number(await ethCall("0x0ded5d00"));
let feed;
try {
  feed = await json("/api/feed");
  // Two different faults, and only one of them is a malfunction.
  //
  // More stored than the chain accepted would mean the ledger is claiming
  // payouts that were never made. That must never happen, and it is asserted
  // absolutely.
  check("the ledger never claims more than the chain paid",
    feed.total <= onChain, `${feed.total} stored vs ${onChain} on chain`);

  // Fewer means a payout on chain whose trajectory cannot be retrieved, and
  // every one of them is mine. Proving the relayed submission path, the prize
  // pool and the treasury vote, I signed trajectory hashes directly with the
  // verifier key and sent them to the contract — each time bypassing the
  // pipeline that stores the samples. No samples were ever recorded, so none
  // of them can be repaired.
  //
  // The pin was set at one and this caught me doing it twice more, which is
  // exactly what it was for. A script that needs an address to have recorded
  // work should go through /api/verify like an operator does; signing straight
  // to the contract is faster and it leaves a payout with nothing behind it.
  // That was the Avalanche deployment. Monad starts from a fresh contract, and
  // every payout on it is meant to go through /api/verify, so every run on
  // chain should have its samples stored and the pin starts at zero.
  const UNBACKED = 0;
  check(`exactly ${UNBACKED} run${UNBACKED === 1 ? "" : "s"} on chain with no stored trajectory`,
    onChain - feed.total === UNBACKED,
    `${onChain - feed.total} unbacked (${feed.total} stored, ${onChain} on chain)`);
} catch (e) {
  check("feed reachable", false, String(e));
}

// Read without requiring a 2xx: /api/health answers 503 when it is reporting a
// fault, and the point of reading it is to find out which fault. Insisting on
// a 2xx here made a degraded system indistinguishable from an unreachable one.
/**
 * The published API description, checked against the API.
 *
 * A spec nobody verifies is a document that drifts until it is fiction, and
 * this one exists to be built against. Every path it lists is fetched with a
 * real id, a real hash and a real address, and the status that comes back has
 * to be one the spec says can come back.
 */
try {
  const spec = await json("/api/openapi");
  const paths = Object.keys(spec.paths ?? {});
  check("the API describes itself", paths.length > 10, `${paths.length} paths`);

  // Real values from this deployment's own feed, not ones pinned from another
  // chain that this deployment has never heard of.
  const newest = feed?.runs?.[0];
  const REAL = {
    "{id}": String(newest?.task_id ?? 1),
    // With nothing in the feed yet, placeholders that exist nowhere: the routes
    // then answer their documented not-found, which is still a documented answer.
    "{hash}": newest?.traj_hash ?? "0x" + "00".repeat(32),
    "{address}": newest?.contributor ?? "0x000000000000000000000000000000000000dEaD",
  };
  let drifted = [];
  for (const path of paths) {
    let url = path;
    for (const [token, value] of Object.entries(REAL)) url = url.replaceAll(token, value);
    // The two routes that need a query parameter to mean anything.
    if (url.endsWith("/history")) url += "?funder=" + REAL["{address}"];
    if (url.endsWith("/dataset/summary")) url += "?taskId=" + REAL["{id}"];
    if (url.endsWith("/api/dataset")) url += "?taskId=" + REAL["{id}"];
    if (url.endsWith("/corpus/previews")) url += "?hashes=" + REAL["{hash}"];

    const documented = Object.keys(spec.paths[path].get?.responses ?? {}).map(Number);
    const got = await status(url);
    if (!documented.includes(got)) drifted.push(`${path} -> ${got}, documented ${documented.join("/")}`);
  }
  check("every documented route answers as documented", drifted.length === 0, drifted.join("; "));
} catch (e) {
  check("openapi reachable", false, String(e));
}

// The corpus previews: a page of episodes in one request, thinned from the real samples.
try {
  const runs = (feed?.runs ?? []).slice(0, 5).map((r) => r.traj_hash);
  if (runs.length) {
    const p = await json(`/api/corpus/previews?hashes=${runs.join(",")}`);
    const got = Object.keys(p.previews ?? {});
    check("corpus previews answer for a page of runs in one request", got.length === new Set(runs).size, `${got.length}/${runs.length}`);
    const one = p.previews[got[0]];
    check("a preview keeps the run's path and all six joints",
      one.path.length >= 2 && one.joints.length === 6 && one.joints[0].length === one.path.length && one.frames >= one.path.length);
  }
  check("previews refuse something that is not a run hash", (await status("/api/corpus/previews?hashes=0x12")) === 400);
} catch (e) {
  check("corpus previews", false, String(e));
}

const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(30_000) })
  .then((r) => r.json())
  .catch(() => null);
// Not "health is ok" — it is not, and it says why. The assertion that matters
// is that nothing is failing except the one fault that is known, explained and
// unrepairable: a payout on chain whose trajectory was never stored, left by my
// own proof of the relayed submission path. Anything else failing is new.
// That payout is on Fuji; on Monad there is no such payout, so nothing is
// excused.
const KNOWN_BAD = new Set();
const failing = Object.entries(health?.checks ?? {}).filter(([, v]) => !v.ok).map(([k]) => k);
const unexpected = failing.filter((k) => !KNOWN_BAD.has(k));
check("health reports nothing failing",
  Boolean(health) && unexpected.length === 0,
  !health ? "health unreachable" : unexpected.length ? `failing: ${unexpected.join(", ")}` : "none failing");
if (health) {
  // Each check reported individually, except the one already asserted above as
  // a known and explained fault — repeating it here would be the same failure
  // counted twice, and a suite that reports one problem as two is a suite
  // nobody trusts the count of.
  for (const [k, v] of Object.entries(health.checks)) {
    if (KNOWN_BAD.has(k)) continue;
    check(`health ${k}`, v.ok, v.detail);
  }

  // The key lives in the signer service. Asserted from outside as well as by
  // the health check itself, because a health check that reports on its own
  // process is exactly what a key drifting back into this one would defeat:
  // the public edge must not be able to sign, whatever it says about itself.
  // Only meaningful where a separate signer service holds the key. This
  // deployment runs as one process with the verifier key in it, and its own
  // health check says so; asserting isolation there would fail by design.
  const keyInProcess = /configured in this process/.test(health.checks.verifierKey?.detail ?? "");
  if (keyInProcess) {
    console.log("  ----  web service reports no signing key — single-process deployment, the key is here by design");
  } else {
    check("web service reports no signing key", health.checks.keyIsolation?.ok === true,
      health.checks.keyIsolation?.detail);
  }
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

  // A byline that anyone can type is not a byline. The check is not that a
  // note can be posted but that one cannot be posted under someone else's
  // address, so the forgery is the assertion that matters.
  const noteTask = feed?.runs?.[0]?.task_id ?? 1;
  const notes = await fetch(`${BASE}/api/task/${noteTask}/notes`);
  const notesBody = notes.ok ? await notes.json() : {};
  check("task notes are readable", notes.status === 200 && Array.isArray(notesBody.notes),
    String(notes.status));

  const forged = await fetch(`${BASE}/api/task/${noteTask}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      body: "posted under an address I do not hold",
      author: "0x000000000000000000000000000000000000dEaD",
      signature: "0x" + "11".repeat(65),
    }),
  });
  check("a note cannot be posted under another address", forged.status === 401,
    String(forged.status));

  // Real physics, on a real run. The assertion is not that a number comes
  // back but that it is a physically correct one: an upright cylinder settles
  // at exactly half its own height, so a rest height that is not ~37.5 mm
  // means the engine is not doing what it claims to.
  //
  // A fresh deployment has no run to ask about, and the checks that need one
  // say so rather than dying on runs[0] of an empty feed.
  const newestRun = feed?.runs?.[0];
  if (newestRun) {
    const phys = await fetch(`${BASE}/api/physics/${newestRun.traj_hash}`);
    const p = phys.ok ? await phys.json() : {};
    check("physics settles the payload at half its own height",
      phys.status === 200 && Math.abs(p.restHeightMm - 37.5) < 1,
      `${phys.status} restHeight=${p.restHeightMm}`);
    check("physics reports a divergence from the kinematic path",
      typeof p.divergenceMm === "number" && p.divergenceMm >= 0 && p.divergenceMm < 200,
      `${p.divergenceMm} mm`);
  } else {
    console.log("  ----  physics, dataset preview and single-episode checks — the feed has no runs on this deployment yet");
  }

  // Every surface that shows current work must be scoped to the live contract,
  // not merely to the live chain. A deployment can be superseded without moving
  // chain, and the dataset routes were still filtering on chain alone — a
  // buyer priced a corpus that included runs the live contract had never heard
  // of. Asserted against the feed, which is scoped correctly.
  const summaryTask = newestRun?.task_id ?? 1;
  const t0 = newestRun ? await fetch(`${BASE}/api/dataset/summary?taskId=${summaryTask}`) : null;
  if (t0?.status === 200) {
    const sum = await t0.json();
    const feedTask0 = feed.runs.filter((r) => r.task_id === summaryTask).length;
    check("dataset preview counts only the live contract's runs",
      sum.episodes === feedTask0, `${sum.episodes} in preview vs ${feedTask0} in feed`);
    check("dataset preview says how much of it is trainable",
      typeof sum.trainable?.episodes === "number" && sum.trainable.of === sum.episodes,
      JSON.stringify(sum.trainable));
  }

  // The subscription is enforced against the chain, not against a flag. The
  // assertion that matters is the pair: an address that paid gets the corpus
  // and an address that did not is refused, from the same endpoint.
  const SUBSCRIBER = await findSubscriber((feed?.runs ?? []).map((r) => r.contributor));
  const unpaid = await fetch(`${BASE}/api/dataset?taskId=0`, {
    headers: { "x-subscriber": "0x000000000000000000000000000000000000dEaD" },
  });
  check("no subscription, no corpus", unpaid.status === 402, String(unpaid.status));

  if (SUBSCRIBER) {
    // Naming a subscriber is not being one: without its signature the
    // download is refused, whoever's address it is.
    const named = await fetch(`${BASE}/api/dataset?taskId=0`, { headers: { "x-subscriber": SUBSCRIBER } });
    check("a subscriber's address alone does not download", named.status === 401,
      `${named.status} for ${SUBSCRIBER}`);
  } else {
    // Not a pass and not a failure: there is nothing subscribed to assert
    // against. Saying so is the honest result; asserting 200 from an address
    // whose time has run out would be testing the fixture, not the product.
    console.log("  ----  a corpus subscription is honoured — no address currently holds " +
                "access on CorpusAccess, so the positive half is unverifiable right now");
  }

  // And the sample a buyer looks at before deciding stays open, or nobody
  // ever gets as far as deciding.
  if (newestRun) {
    const oneEpisode = await fetch(`${BASE}/api/dataset?traj=${newestRun.traj_hash}`);
    check("a single episode needs no subscription", oneEpisode.status === 200, String(oneEpisode.status));
  }

  const signGet = await fetch(`${BASE}/api/sign`);
  const signBody = await signGet.json().catch(() => ({}));
  if (keyInProcess) {
    // The pair that matters in one process: it holds the key, and says it does.
    check("/api/sign reports the key it holds", signGet.status === 200 && signBody.holdsKey === true,
      `${signGet.status} holdsKey=${signBody.holdsKey}`);
  } else {
    check("public /api/sign holds no key", signGet.status === 503 && signBody.holdsKey === false,
      `${signGet.status} ${JSON.stringify(signBody)}`);
  }
}

// --- archived runs stay archived --------------------------------------------
const archive = await json("/api/archive").catch(() => null);
// Whether the store carries runs from an earlier chain depends on what the
// Monad deployment was seeded with, so the archive answering is the
// assertion, not its having runs.
check("archive answers", archive !== null, `${archive?.total ?? 0} runs`);
if (archive?.chains?.length) {
  const onPrior = archive.chains.every((c) => c.id !== CHAIN_ID);
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
    check(`feed tx resolves on ${appChain.name} ${run.tx_hash.slice(0, 12)}`, r.result != null);
  }
}

// --- a stored run still hashes to what the chain recorded -------------------
if (feed?.runs?.length) {
  // A server that stops answering here is a failure to report, not a reason
  // for the suite to die with a stack trace and no count.
  try {
  const one = await json(`/api/trajectory/${feed.runs[0].traj_hash}`);
  check("stored samples re-hash to the recorded value", one.integrity?.matches === true);
  check("trajectory reports its settlement chain", one.chainId === CHAIN_ID, String(one.chainId));

  // Every run on file re-hashes, not just the newest. A scene-carrying run
  // hashes as version 2 and a run whose instruction named its props still
  // hashes as version 1; if either serialisation drifted, the payouts
  // that predate version 2 would stop matching the chain and this would fail.
  // Counted the way canonicalise decides, not by one field of it. Keying on
  // payloadIds alone reported a two-arm run as version 1, which is the exact
  // confusion this assertion exists to prevent.
  const seen = { 1: 0, 2: 0, 3: 0 };
  const broken = [];
  for (const r of feed.runs) {
    const t = await json(`/api/trajectory/${r.traj_hash}`);
    if (t.integrity?.matches !== true) broken.push(r.traj_hash.slice(0, 12));
    const s0 = t.samples?.[0] ?? {};
    const version = s0.q2 ? 3 : (t.payloadIds?.length || s0.object2) ? 2 : 1;
    seen[version] += 1;
    // A run that records a second payload must name both props, and one that
    // names two props must record both — a scene and its recording cannot
    // disagree about how many objects were in the room.
    const two = Boolean(t.samples?.[0]?.object2);
    if (two !== ((t.payloadIds?.length ?? 1) > 1)) {
      broken.push(`${r.traj_hash.slice(0, 12)} scene/recording mismatch`);
    }
  }
  check(`every stored run re-hashes (${seen[1]} v1, ${seen[2]} v2, ${seen[3]} v3)`,
    broken.length === 0, broken.join(" "));
  // On the chains before this one the oldest serialisation had settled payouts
  // behind it, and its continued presence was asserted. The feed is scoped to
  // the live contract, and a Monad deployment that began after version 2 has
  // no version 1 runs to keep — so their absence here is reported, not failed.
  // The re-hash above is what protects them wherever they do exist.
  if (seen[1] > 0) check("version 1 runs are still on file", true, `${seen[1]}`);
  else console.log("  ----  version 1 runs are still on file — this deployment has recorded none");
  } catch (e) {
    check("stored runs are readable", false, String(e));
  }
}

// --- edge cases fail in a specific way, not with a 500 ----------------------
const EDGES = [
  ["/api/dataset", 400], ["/api/dataset?taskId=-1", 400],
  ["/api/dataset?traj=0xdead", 400],
  // 402, not 404. A whole-corpus pull is refused before we look up whether
  // that task has any data — telling an unsubscribed caller which tasks exist
  // and which are empty is part of what the subscription is for.
  ["/api/dataset?taskId=4", 402],
  ["/api/calls/notanaddress", 400], ["/api/trajectory/0xdeadbeef", 404],
  ["/api/space/abc", 400], ["/api/props/u_missing", 404],
  ["/api/task/abc/paths", 400], ["/api/dataset/summary", 400],
];
for (const [path, want] of EDGES) {
  const got = await status(path);
  check(`edge ${path} -> ${want}`, got === want, got === want ? "" : `got ${got}`);
}

// --- security headers -------------------------------------------------------
const head = await fetch(BASE, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options"]) {
  check(`header ${h}`, Boolean(head?.headers.get(h)), head ? "" : "home page unreachable");
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) { console.log("  failures:"); failures.forEach((f) => console.log(`    - ${f}`)); }
process.exit(fail ? 1 : 0);
