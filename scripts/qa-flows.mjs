/** Interactive items: hub filtering and search, station practice, detail pages. */
import { chromium } from "playwright";
const BASE = "https://thenar.io";
const browser = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const out = [];
const say = (id, pass, d) => { out.push(pass); console.log(`${pass?"PASS":"FAIL"}  ${id.padEnd(5)} ${d}`); };

const fresh = async () => {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e=>errs.push(String(e).slice(0,80)));
  page.on("console", m=>{ if(m.type()==="error") errs.push(m.text().slice(0,80)); });
  return { ctx, page, errs };
};

// ---- A3/A4/A5/A6/D5: hub filtering and search -----------------------------
{
  const { ctx, page, errs } = await fresh();
  await page.goto(BASE+"/hub", { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(9000);
  const rowCount = () => page.evaluate(() => document.querySelectorAll("a[href^='/station/']").length);
  const before = await rowCount();

  // A3 — scenario filter
  await page.getByRole("button", { name: /^workshop$/i }).click();
  await page.waitForTimeout(1500);
  const wk = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")];
    return { n: rows.length, allWorkshop: rows.every(r => /workshop/i.test(r.textContent||"")) };
  });
  say("A3", wk.n > 0 && wk.n < before && wk.allWorkshop, `scenario=Workshop → ${wk.n} rows (from ${before}), all workshop=${wk.allWorkshop}`);

  // A5 — Every Task widens the set
  await page.getByRole("button", { name: /^all$/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^every task$/i }).click();
  await page.waitForTimeout(1500);
  const every = await page.evaluate(()=>document.querySelectorAll("tbody tr").length);
  await page.getByRole("button", { name: /^accepting runs$/i }).click();
  await page.waitForTimeout(1200);
  const accepting = await page.evaluate(()=>document.querySelectorAll("tbody tr").length);
  say("A5", every >= accepting, `Every Task=${every} rows ≥ Accepting=${accepting}`);

  // A6 — search narrows to a match
  const box = page.getByPlaceholder(/search/i);
  await box.fill("spoon");
  await page.waitForTimeout(1500);
  const hit = await page.evaluate(()=>({ n: document.querySelectorAll("tbody tr").length,
                                          txt: document.body.innerText.toLowerCase().includes("spoon") }));
  say("A6", hit.n >= 1 && hit.txt, `search "spoon" → ${hit.n} rows`);

  // D5 — search with no match must state it, not blank out
  await box.fill("zzzzz-no-such-task-zzzzz");
  await page.waitForTimeout(1500);
  const none = await page.evaluate(()=>({ n: document.querySelectorAll("tbody tr").length,
                                           txt: document.body.innerText.replace(/\s+/g," ") }));
  say("D5", none.n === 0 && /nothing|no task|no match|0 task/i.test(none.txt), `no-match → ${none.n} rows, message present=${/nothing|no task|no match|0 task/i.test(none.txt)}`);
  say("A4", errs.length === 0, `hub interaction console errors=${errs.length} ${errs.slice(0,1)}`);
  await ctx.close();
}

// ---- A9/D6: station practice with no wallet -------------------------------
{
  const { ctx, page, errs } = await fresh();
  await page.goto(BASE+"/station/1", { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(7000);
  const pre = await page.evaluate(()=>({
    practise: !!document.body.innerText.match(/practise first/i),
    noWallet: /no wallet, no slot used/i.test(document.body.innerText),
  }));
  await page.getByText(/practise first/i).first().click().catch(()=>{});
  await page.waitForTimeout(4000);
  const post = await page.evaluate(()=>({
    canvas: !!document.querySelector("canvas"),
    running: !/ready to record/i.test(document.body.innerText),
    txt: document.body.innerText.replace(/\s+/g," ").slice(0,90),
  }));
  say("A9", pre.practise && post.canvas && post.running, `practice offered=${pre.practise} started=${post.running}`);
  say("D6", pre.noWallet, `states "no wallet, no slot used"=${pre.noWallet}`);
  say("D6b", errs.length === 0, `station console errors=${errs.length} ${errs.slice(0,1)}`);
  await ctx.close();
}

// ---- A23/A24/A25: detail pages with real identifiers ----------------------
{
  const feed = await fetch(BASE+"/api/feed").then(r=>r.json());
  const s = JSON.stringify(feed);
  const hash = (s.match(/0x[0-9a-f]{64}/i)||[])[0];
  const addr = (s.match(/0x[0-9a-fA-F]{40}/)||[])[0];
  for (const [id, route, need] of [
    ["A24", `/run/${hash}`, /score|trajectory|placement|deviation/i],
    ["A23", `/operator/${addr}`, /run|score|earned|paid/i],
    ["A25", `/licence/1`, /licence|policy|contributor|not found|no policy/i],
  ]) {
    const { ctx, page, errs } = await fresh();
    await page.goto(BASE+route, { waitUntil:"domcontentloaded" }).catch(()=>{});
    await page.waitForTimeout(6000);
    const t = await page.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
    say(id, need.test(t) && errs.length === 0, `${route.slice(0,44)} matched=${need.test(t)} errors=${errs.length}`);
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${out.filter(Boolean).length}/${out.length} pass`);
