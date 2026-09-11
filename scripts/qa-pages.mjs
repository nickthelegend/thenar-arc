/**
 * Phase 2 runner for the page items (A) — real browser, real deployment.
 *
 * Every item captures console errors and failed network requests as well as its
 * own assertion, because the plan's definition of PASS requires all three.
 * A page that renders correctly and logs an error is a FAIL.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://thenar.io";
const ONLY = process.argv[3];

const ITEMS = [
  ["A1",  "/",                 async (p) => {
      const r = await p.evaluate(() => ({
        weave: !!document.querySelector(".word-back") && !!document.querySelector(".subject"),
        sections: document.querySelectorAll(".lp > section").length,
        h1: document.querySelectorAll("h1").length,
      }));
      return [r.weave && r.sections === 7 && r.h1 === 1, `weave=${r.weave} sections=${r.sections} h1=${r.h1}`];
  }],
  ["A2",  "/hub",              async (p) => {
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return { rows: document.querySelectorAll("tbody tr, li[data-task], a[href^='/station/']").length,
                 hasFigures: /TASKS\s*\d/i.test(t) && /ESCROW AT STAKE/i.test(t) };
      });
      return [r.rows > 0 && r.hasFigures, `taskLinks=${r.rows} figures=${r.hasFigures}`];
  }],
  ["A7",  "/space",            async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("a[href^='/station/']").length);
      return [n > 0, `roomLinks=${n}`];
  }],
  ["A8",  "/station/1",        async (p) => {
      await p.waitForTimeout(5000);
      const r = await p.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return { canvas: false };
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        return { canvas: true, w: c.width, h: c.height, alive: gl ? !gl.isContextLost() : false,
                 brief: /datum circle|payload/i.test(document.body.innerText) };
      });
      return [r.canvas && r.w > 300 && r.alive && r.brief, JSON.stringify(r)];
  }],
  ["A10", "/spec",             async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [/21/.test(t) && /8,?080/.test(t) && /512/.test(t), `parts21=${/21/.test(t)} tris=${/8,?080/.test(t)} reach=${/512/.test(t)}`];
  }],
  ["A11", "/leaderboard",      async (p) => {
      const n = await p.evaluate(() => (document.body.innerText.match(/0x[0-9a-fA-F]{4}/g) || []).length);
      return [n > 0, `addressesShown=${n}`];
  }],
  ["A12", "/portfolio",        async (p) => {
      const t = await p.evaluate(() => document.body.innerText.trim().length);
      return [t > 120, `textLen=${t}`];
  }],
  ["A13", "/inventory",        async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("canvas, img").length);
      return [n > 0, `previews=${n}`];
  }],
  ["A14", "/corpus",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 120, "renders" ]],
  ["A15", "/policies",         async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A16", "/foundry",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A17", "/post",             async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("input,select,textarea,button").length);
      return [n > 3, `controls=${n}`];
  }],
  ["A18", "/changelog",        async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 200, "entries" ]],
  ["A19", "/status",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 120, "renders" ]],
  ["A20", "/archive",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A21", "/passkey",          async (p) => {
      const r = await p.evaluate(() => ({ crypto: !!window.crypto?.subtle, len: document.body.innerText.trim().length }));
      return [r.crypto && r.len > 120, JSON.stringify(r)];
  }],
  ["A22", "/task/1",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 200, "renders" ]],
  ["A26", "/handheld",         async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 60, "renders" ]],
  ["A27", "/offline",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 30, "renders" ]],
  ["A28", "/no-such-page-xyz", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [/not found|404/i.test(t) && !/stack|at Object|webpack/i.test(t), `notFound=${/not found|404/i.test(t)}`];
  }],
  ["D1",  "/task/99999",       async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 30 && !/stack|at Object/i.test(t), "no crash"];
  }],
  ["D2",  "/operator/0x000000000000000000000000000000000000dEaD", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 60, "empty state present"];
  }],
  ["D3",  "/run/0xbogushashvalue", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 30 && !/stack|at Object/i.test(t), "no crash"];
  }],
];

const browser = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const results = [];

for (const [id, route, assert] of ITEMS) {
  if (ONLY && !ONLY.split(",").includes(id)) continue;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const netFail = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.startsWith(BASE) || u.includes("thenar.io"))) netFail.push(`${r.status()} ${u.replace(BASE, "")}`);
  });

  let ok = false, detail = "";
  try {
    // domcontentloaded, not networkidle. The station holds a live occupancy
    // stream and an RPC watch subscription open for as long as it is on screen,
    // so network never goes idle and a networkidle wait times out on a page
    // that loaded correctly in 450ms.
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(route.startsWith("/station") ? 6000 : 1800);
    // The 404 item is expected to be a 404 document; nothing else is.
    // A route that is meant not to exist is *expected* to 404, and a 404 is the
    // correct answer rather than a defect. Two requests carry that status on
    // these items and both are accounted for: the document itself, and one
    // re-fetch of the same URL by the bundled wallet connector, which reads the
    // current page's Cross-Origin-Opener-Policy header before it is allowed to
    // open a popup. Nothing else on the route is permitted to 4xx.
    if (id === "A28" || id === "D1" || id === "D3") {
      for (let k = netFail.length - 1; k >= 0; k--) {
        if (netFail[k].startsWith("404") && netFail[k].endsWith(route)) netFail.splice(k, 1);
      }
      for (let k = consoleErrors.length - 1; k >= 0; k--) {
        if (/status of 404|Cross-Origin-Opener-Policy: HTTP error! status: 404/.test(consoleErrors[k])) {
          consoleErrors.splice(k, 1);
        }
      }
    }
    [ok, detail] = await assert(page);
  } catch (e) { detail = "EXCEPTION " + String(e).slice(0, 100); }

  const pass = ok && consoleErrors.length === 0 && netFail.length === 0;
  results.push({ id, route, pass, detail, consoleErrors: [...new Set(consoleErrors)].slice(0,2), netFail: [...new Set(netFail)].slice(0,3) });
  await page.close();
}
await browser.close();

let passed = 0;
for (const r of results) {
  if (r.pass) passed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.route.padEnd(34)} ${r.detail}`);
  r.consoleErrors.forEach((e) => console.log(`         console: ${e}`));
  r.netFail.forEach((e) => console.log(`         network: ${e}`));
}
console.log(`\n${passed}/${results.length} pass`);
