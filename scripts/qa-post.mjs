/** POST-path items and OpenAPI conformance. */
const BASE = "https://thenar.io";
const post = (p, body, headers = {}) => fetch(BASE + p, {
  method: "POST", headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
});
let pass = 0, total = 0;
const check = (id, ok, detail) => { total++; if (ok) pass++; console.log(`${ok?"PASS":"FAIL"}  ${id.padEnd(5)} ${detail}`); };

// B34 — migrate must refuse without the token. Not run: it is a one-shot copy
// into a database that is already the live one.
{
  const r = await post("/api/migrate", {});
  const j = await r.json().catch(()=>({}));
  check("B34", r.status === 401 && /not authorised/i.test(j.error ?? ""), `migrate unauthenticated → ${r.status} ${JSON.stringify(j).slice(0,50)}`);
}
// B35 — hit must honour DNT and GPC, and must count otherwise.
{
  const dnt = await post("/api/hit", { path: "/qa-probe" }, { dnt: "1" });
  const jd = await dnt.json().catch(()=>({}));
  check("B35a", dnt.status === 200 && jd.counted === false && jd.reason === "signalled", `DNT honoured → counted=${jd.counted} reason=${jd.reason}`);
  const gpc = await post("/api/hit", { path: "/qa-probe" }, { "sec-gpc": "1" });
  const jg = await gpc.json().catch(()=>({}));
  check("B35b", gpc.status === 200 && jg.counted === false, `GPC honoured → counted=${jg.counted}`);
}
// B36 — notify must validate a subscription rather than store anything shaped.
{
  const r = await post("/api/notify", { nonsense: true });
  const j = await r.json().catch(()=>({}));
  check("B36", r.status >= 400 && r.status < 500 && !!j.error, `invalid subscription → ${r.status} ${JSON.stringify(j).slice(0,60)}`);
}
// B26 — verify must refuse a caller-supplied score (re-checked here as a POST item).
{
  const r = await post("/api/verify", { taskId: 1, contributor: "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0",
    score: 10000, durationSeconds: 1, deviationMm: 0, success: true, samples: [], payloadIds: [] });
  const j = await r.json().catch(()=>({}));
  check("B26", r.status === 400 && !/10000/.test(JSON.stringify(j)), `client score ignored → ${r.status} ${j.error}`);
}
// B37 — every path the OpenAPI document advertises must actually answer.
{
  const doc = await fetch(BASE + "/api/openapi").then(r=>r.json());
  const paths = Object.keys(doc.paths ?? {});
  const bad = [];
  for (const p of paths) {
    // Substitute a real-looking value for each templated segment.
    const concrete = p
      .replace(/\{[^}]*hash[^}]*\}/gi, "0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2")
      .replace(/\{[^}]*address[^}]*\}/gi, "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0")
      .replace(/\{[^}]*\}/g, "1");
    const methods = Object.keys(doc.paths[p]);
    const m = methods.includes("get") ? "GET" : methods[0].toUpperCase();
    try {
      const r = await fetch(BASE + concrete, { method: m, signal: AbortSignal.timeout(30000) });
      // 5xx or 404-on-a-documented-path means the document is lying.
      if (r.status >= 500 || r.status === 404) bad.push(`${m} ${concrete} → ${r.status}`);
    } catch (e) { bad.push(`${m} ${concrete} → ${String(e).slice(0,40)}`); }
  }
  check("B37", bad.length === 0, `openapi advertises ${paths.length} paths, unanswered: ${bad.length}${bad.length?" · "+bad.slice(0,3).join(" | "):""}`);
}
console.log(`\n${pass}/${total} pass`);
process.exit(pass === total ? 0 : 1);
