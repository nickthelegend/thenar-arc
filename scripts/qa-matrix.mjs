/**
 * Sections D8 / D9 / E — every page, both themes, both viewports.
 *
 * E2 and E3 (console clean, network clean) are not separate items you can test
 * once; they are a property of every page. So they are measured here across the
 * whole matrix rather than asserted at the end.
 */
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "https://thenar.io";

const ROUTES = ["/", "/hub", "/space", "/spec", "/leaderboard", "/portfolio", "/inventory",
  "/corpus", "/policies", "/foundry", "/post", "/changelog", "/status", "/archive",
  "/passkey", "/handheld", "/offline", "/task/1", "/station/1"];

const browser = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const rows = [];

for (const [mode, width, height, theme] of [["desktop-light",1440,900,null],["dark",1440,900,"dark"],["mobile",390,844,null]]) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport:{width,height} });
    if (theme) await ctx.addInitScript((t)=>{try{localStorage.setItem("thenar.theme",t)}catch{}}, theme);
    const page = await ctx.newPage();
    const errs = [], net = [];
    page.on("pageerror", e => errs.push(String(e).slice(0,90)));
    page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,90)); });
    page.on("response", r => { if (r.status()>=400 && r.url().includes("thenar.io")) net.push(`${r.status()} ${r.url().replace(BASE,"")}`); });
    let over = null, bg = null, unstyled = null;
    try {
      await page.goto(BASE + route, { waitUntil:"domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(route.startsWith("/station") ? 5000 : 2200);
      const r = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth > window.innerWidth + 1,
        bg: getComputedStyle(document.body).backgroundColor,
        // An unstyled surface: body background still the UA default white/transparent.
        unstyled: ["rgba(0, 0, 0, 0)","rgb(255, 255, 255)"].includes(getComputedStyle(document.body).backgroundColor),
      }));
      over = r.over; bg = r.bg; unstyled = r.unstyled;
    } catch (e) { errs.push("NAV " + String(e).slice(0,60)); }
    rows.push({ mode, route, over, bg, unstyled, errs:[...new Set(errs)], net:[...new Set(net)] });
    await ctx.close();
  }
}
await browser.close();

let fails = 0;
for (const r of rows) {
  const bad = [];
  if (r.over) bad.push("H-OVERFLOW");
  if (r.unstyled) bad.push("UNSTYLED");
  if (r.errs.length) bad.push(`CONSOLE(${r.errs.length})`);
  if (r.net.length) bad.push(`NET(${r.net.length})`);
  if (bad.length) {
    fails++;
    console.log(`FAIL ${r.mode.padEnd(14)} ${r.route.padEnd(14)} bg=${r.bg} ${bad.join(" ")}`);
    r.errs.slice(0,2).forEach(e=>console.log(`       console: ${e}`));
    r.net.slice(0,3).forEach(e=>console.log(`       network: ${e}`));
  }
}
console.log(`\n${rows.length - fails}/${rows.length} page-mode combinations clean`);
process.exit(fails === 0 ? 0 : 1);
