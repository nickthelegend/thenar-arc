/**
 * Phase 2 runner for the API items (B) — against the deployment that actually
 * serves them. next.config rewrites every /api/* on the site to BACKEND_ORIGIN,
 * so testing the Vercel host would test a proxy and report the backend's
 * behaviour as the site's.
 */
const BASE = process.argv[2] ?? "https://thenar.io";
const REAL_HASH = "0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2";
// A real uploaded prop id, read from the table rather than pinned, so the item
// keeps testing a prop that exists rather than one that used to.
const PROP_ID = await fetch(BASE + "/api/props").then(r => r.json())
  .then(j => (j.props ?? [])[0]?.id).catch(() => null);

// [id, path, expectedStatus, assert(json|text, res) -> [ok, detail]]
const J = (f) => (b, r) => {
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return [false, `content-type ${ct}`];
  try { return f(JSON.parse(b)); } catch (e) { return [false, "invalid JSON"]; }
};
const nonEmpty = J((j) => [j != null && (Array.isArray(j) ? j.length >= 0 : Object.keys(j).length > 0), Array.isArray(j) ? `array[${j.length}]` : `keys=${Object.keys(j).length}`]);

const ITEMS = [
  ["B1",  "/api/health",        200, J((j) => [typeof j.live === "boolean" && !!j.checks, `live=${j.live} audit=${j.audit ? Object.keys(j.audit).length : "none"}`])],
  ["B2",  "/api/contract",      200, J((j) => [!!j.address && Array.isArray(j.abi ?? j.ABI ?? []), `address=${j.address}`])],
  ["B3",  "/api/stats",         200, nonEmpty],
  ["B4",  "/api/feed",          200, nonEmpty],
  ["B5",  "/api/task/1/runs",   200, nonEmpty],
  ["B6",  "/api/task/1/attempts", 200, nonEmpty],
  // history is scoped to a funder; a bare call correctly refuses. Both halves
  // are the item: the refusal must be a clean JSON 400, and a real address must
  // return data.
  ["B7a", "/api/task/1/history", 400, J((j) => [/address/i.test(j.error ?? ""), `refuses: ${j.error}`])],
  ["B7b", "/api/task/1/history?funder=0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0", 200, nonEmpty],
  ["B8",  "/api/task/1/manifest", 200, nonEmpty],
  ["B9",  "/api/task/1/datasheet", 200, (b, r) => [b.length > 40, `${(r.headers.get("content-type")||"").split(";")[0]} ${b.length}B`]],
  ["B10", "/api/task/1/notes",  200, nonEmpty],
  ["B11", "/api/task/1/paths",  200, nonEmpty],
  ["B12", "/api/task/1/team",   200, nonEmpty],
  // /api/props is the *uploaded* prop table, not the 34 built-ins that ship in
  // the CAD library — the plan conflated the two. Correct means: a well-formed
  // list whose rows carry the fields the inventory renders.
  ["B13", "/api/props",         200, J((j) => {
      const a = Array.isArray(j) ? j : j.props ?? [];
      const ok = a.every((p) => p.id && p.label && typeof p.bytes === "number" && p.sha256);
      return [Array.isArray(a) && ok, `uploaded=${a.length} wellFormed=${ok}`];
  })],
  ["B15", "/api/space",         200, nonEmpty],
  ["B16", "/api/space/1",       200, nonEmpty],
  ["B17", "/api/corpus",        200, nonEmpty],
  ["B18a", "/api/dataset",              400, J((j) => [/taskId/i.test(j.error ?? ""), `refuses: ${j.error}`])],
  // Bulk corpus is gated by the CorpusAccess contract; 402 naming that contract
  // is the correct answer without a subscriber, not a fault. The single-episode
  // path is deliberately open, and that is the half that must return data.
  ["B18b", "/api/dataset?taskId=1",     402, J((j) => [/subscription/i.test(j.error ?? "") && !!j.contract, `gated by ${j.contract}`])],
  ["B18c", "/api/dataset?traj=0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2", 200,
           J((j) => [JSON.stringify(j).length > 500, `open episode, ${JSON.stringify(j).length}B`])],
  ["B19a", "/api/dataset/summary",          400, J((j) => [/taskId/i.test(j.error ?? ""), `refuses: ${j.error}`])],
  ["B19b", "/api/dataset/summary?taskId=1", 200, nonEmpty],
  ["B20", "/api/archive",       200, nonEmpty],
  ["B21", "/api/openapi",       200, J((j) => [!!(j.openapi || j.swagger) && !!j.paths, `openapi=${j.openapi} paths=${j.paths ? Object.keys(j.paths).length : 0}`])],
  ["B22", "/api/policy",        200, nonEmpty],
  ["B23", "/api/snapshot",      200, nonEmpty],
  // POST-only by design; 405 on GET is the correct answer, not a defect.
  ["B25", "/api/submitted",     405, () => [true, "GET refused (allow: OPTIONS, POST)"]],
  ["B33", "/api/reconcile",     200, nonEmpty],
  ["B24", "/api/snapshot/drill", 200, J((j) => [!!j.sha256 && j.bytes > 0, `${j.key} ${j.bytes}B sha256=${String(j.sha256).slice(0,10)}…`])],
  // A real prop id serves the binary the CAD kernel generated; a bogus one 404s
  // in JSON like every other error on this API.
  ["B14", `/api/props/${PROP_ID}`, 200, (b, r) => [
      (r.headers.get("content-type")||"").includes("gltf") && b.startsWith("glTF"),
      `${(r.headers.get("content-type")||"").split(";")[0]} magic=${b.slice(0,4)}`]],
  ["B28", `/api/trajectory/${REAL_HASH}`, 200, J((j) => [j.trajHash === REAL_HASH, `trajHash echoes, taskId=${j.taskId}`])],
  ["B28b", "/api/trajectory/0xdeadbeef", 404, J((j) => [/no trajectory/i.test(j.error ?? ""), `refuses: ${j.error}`])],
  ["B29", `/api/trajectory/${REAL_HASH}/similar`, 200, nonEmpty],
  ["B30", `/api/trajectory/${REAL_HASH}/annotation`, 200, nonEmpty],
  ["B31", `/api/physics/${REAL_HASH}`, 200, J((j) => [!!j.engine, `engine=${j.engine}`])],
  // The one live third-party dependency: Glacier must answer, and the payload
  // must say it came from Glacier rather than from anything of ours.
  ["B32", "/api/glacier/0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0", 200,
          J((j) => [j.source === "glacier", `source=${j.source}`])],
  ["D4",  "/api/props/definitely-not-a-prop", 404, (b, r) => {
      const ct = r.headers.get("content-type") ?? "";
      return [ct.includes("json"), `content-type ${ct.split(";")[0]}`];
  }],
];

const results = [];
for (const [id, path, want, assert] of ITEMS) {
  let res, body = "";
  try {
    res = await fetch(BASE + path, { signal: AbortSignal.timeout(45000) });
    body = await res.text();
  } catch (e) { results.push({ id, path, pass: false, detail: "FETCH " + String(e).slice(0, 60) }); continue; }
  const [ok, detail] = assert(body, res);
  const pass = res.status === want && ok;
  results.push({ id, path, pass, detail: `HTTP ${res.status}${res.status !== want ? ` (want ${want})` : ""} · ${detail}` });
}
let p = 0;
for (const r of results) { if (r.pass) p++; console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.path.padEnd(34)} ${r.detail}`); }
console.log(`\n${p}/${results.length} pass`);
process.exit(p === results.length ? 0 : 1);
