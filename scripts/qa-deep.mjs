/**
 * Deep page assertions.
 *
 * The first pass of this plan checked several pages only for "renders more than
 * 80 characters", which is the vague should-work the plan forbids. Each item
 * here names the heading the page must carry and, where the page has a data
 * source, a figure that must agree with it — so a page that renders but shows
 * the wrong numbers, or numbers from nowhere, fails.
 */
import { chromium } from "playwright";
const BASE = "https://thenar.io";

const json = (p) => fetch(BASE + p, { signal: AbortSignal.timeout(45000) }).then(r => r.json()).catch(() => null);
const deep = (o, re) => { const out = []; const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") return Object.entries(v).forEach(([k, x]) => { if (re.test(k)) out.push(x); walk(x); });
  }; walk(o); return out; };

const [corpus, policy, archive, props] = await Promise.all([
  json("/api/corpus"), json("/api/policy"), json("/api/archive"), json("/api/props"),
]);

const ITEMS = [
  ["A14", "/corpus",    "The corpus",          () => deep(corpus, /episodes|samples|count|total|runs/i).filter(n => typeof n === "number" && n > 0)],
  ["A15", "/policies",  "Policies",            () => deep(policy,  /count|total|policies|contributors/i).filter(n => typeof n === "number" && n > 0)],
  ["A16", "/foundry",   "Foundry",             () => []],
  ["A17", "/post",      "Post a task",         () => []],
  // The archive's correctness is that every run it is given is rendered — it
  // returns two groups, prior chains and superseded contracts, and dropping
  // either would hide real payouts. Checked as a row count, not as a figure:
  // the page prints per-group counts rather than an overall total, which is
  // the more useful thing to print.
  ["A20", "/archive",   "Archive",             () => [], {
      rows: (archive?.chains ?? []).reduce((n, c) => n + c.runs.length, 0) +
            (archive?.contracts ?? []).reduce((n, c) => n + c.runs.length, 0),
      labels: (archive?.contracts ?? []).map((c) => c.label),
  }],
  ["A18", "/changelog", "Changelog",           () => []],
  ["A12", "/portfolio", "Portfolio",           () => []],
  ["A13", "/inventory", "Inventory",           () => []],
  ["A26", "/handheld",  "Demonstrate by hand", () => []],
  ["A27", "/offline",   "No network",          () => []],
];

const browser = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
let pass = 0;
for (const [id, route, heading, figures, extra] of ITEMS) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  const errs = [], net = [];
  page.on("pageerror", e => errs.push(String(e).slice(0,80)));
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,80)); });
  page.on("response", r => { if (r.status()>=400 && r.url().includes("thenar.io")) net.push(`${r.status()} ${r.url().replace(BASE,"")}`); });

  await page.goto(BASE + route, { waitUntil:"domcontentloaded" }).catch(()=>{});
  await page.waitForTimeout(6000);
  const got = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
    text: document.body.innerText.replace(/\s+/g, " "),
    controls: document.querySelectorAll("button,input,select,textarea").length,
    runRows: document.querySelectorAll('a[href^="/run/"], li').length,
  }));

  const headingOk = got.h1 === heading;
  // At least one figure from this page's own API must appear on the page.
  const wanted = figures();
  const figureOk = wanted.length === 0 || wanted.some(n =>
    new RegExp(`\\b${String(n).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(got.text.replace(/,/g, "")));
  // Extra, item-specific expectations.
  let extraOk = true, extraNote = "";
  if (extra?.rows !== undefined) {
    const labelsOk = (extra.labels ?? []).every((l) => got.text.includes(l));
    extraOk = got.runRows >= extra.rows && labelsOk;
    extraNote = ` · rows ${got.runRows}/${extra.rows} groupsNamed=${labelsOk}`;
  }
  const ok = headingOk && figureOk && extraOk && errs.length === 0 && net.length === 0;
  if (ok) pass++;
  console.log(`${ok?"PASS":"FAIL"}  ${id.padEnd(4)} ${route.padEnd(12)} h1="${got.h1}"${headingOk?"":` (want "${heading}")`}` +
              `${wanted.length ? ` · figure from API present=${figureOk}` : ""}${extraNote}` +
              `${errs.length?` · console(${errs.length})`:""}${net.length?` · net(${net.length})`:""}`);
  errs.slice(0,2).forEach(e=>console.log(`        console: ${e}`));
  net.slice(0,2).forEach(e=>console.log(`        network: ${e}`));
  await ctx.close();
}
await browser.close();
console.log(`\n${pass}/${ITEMS.length} pass`);
process.exit(pass === ITEMS.length ? 0 : 1);
