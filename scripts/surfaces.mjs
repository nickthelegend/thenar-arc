/**
 * Walk every surface and report what the theme is doing on it.
 *
 * Contrast is measured, not judged: any text node whose computed colour lands
 * under 4.5:1 against the background actually painted behind it is a finding,
 * and so is any element still painting a colour from the discarded world.
 *
 *   node scripts/surfaces.mjs http://localhost:PORT [--shots]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2];
const SHOTS = process.argv.includes("--shots");
const OUT = "/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-monad-blitz/c4afa5c0-ea5d-456c-bee5-d383c3d34809/scratchpad/surfaces";
if (SHOTS) mkdirSync(OUT, { recursive: true });

const ROUTES = ["/", "/hub", "/space", "/spec", "/leaderboard", "/portfolio", "/inventory",
  "/corpus", "/policies", "/foundry", "/post", "/changelog", "/status", "/archive", "/passkey"];

const browser = await chromium.launch();
const rows = [];

for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
  } catch { rows.push({ route, error: "load timeout" }); await page.close(); continue; }
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const lum = (c) => {
      const m = c.match(/[\d.]+/g); if (!m) return null;
      // Chrome serialises a color-mix() result as color(srgb r g b / a) with
      // components in 0-1, not rgb() in 0-255. Read as 0-255 it made the
      // landing's translucent nav look almost black and reported its brand
      // lockup at 1.08:1 — a measurement bug wearing a design bug's clothes.
      const unit = /^color\(/.test(c);
      const [r, g, b] = m.slice(0, 3).map((v) => Number(v) * (unit ? 255 : 1));
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const m = bg.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[m.length - 1]) > 0.5)) return bg;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const low = [];
    const orange = [];
    // The discarded orange family (#FF6A00, #FF9A3D, #AD4407), and nothing
    // else. An earlier form of this also matched the reject red rgb(182,13,51)
    // and reported the verdict colour as leftover branding on four surfaces.
    const ORANGE = /rgb\(\s*(1[7-9][0-9]|2[0-9]{2})\s*,\s*(6[0-9]|[7-9][0-9]|1[0-7][0-9])\s*,\s*([0-9]|[1-7][0-9])\s*\)/;
    document.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el);
      if (ORANGE.test(cs.color) || ORANGE.test(cs.backgroundColor) || ORANGE.test(cs.borderTopColor)) {
        if (orange.length < 4) orange.push(el.tagName + "." + (el.className||"").toString().slice(0, 26));
      }
      const txt = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!txt) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const fg = lum(cs.color), bg = lum(bgOf(el));
      if (fg === null || bg === null) return;
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      const px = parseFloat(cs.fontSize);
      const need = (px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
      if (ratio < need && low.length < 5) {
        low.push({ t: el.tagName, px: +px.toFixed(0), ratio: +ratio.toFixed(2), need,
                   txt: (el.textContent || "").trim().slice(0, 22) });
      }
    });
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      low, orange,
    };
  });
  rows.push({ route, ...r, errs: errs.length, errList: errs.slice(0, 2) });
  if (SHOTS) await page.screenshot({ path: `${OUT}/${route.replace(/\//g, "_") || "_root"}.png` });
  await page.close();
}
await browser.close();

for (const r of rows) {
  if (r.error) { console.log(`${r.route.padEnd(13)} LOAD ${r.error}`); continue; }
  const flags = [];
  if (r.hOverflow) flags.push("H-OVERFLOW");
  if (r.orange?.length) flags.push(`OLD-ACCENT(${r.orange.length})`);
  if (r.low?.length) flags.push(`CONTRAST(${r.low.length})`);
  if (r.errs) flags.push(`ERR(${r.errs})`);
  console.log(`${r.route.padEnd(13)} bg=${(r.bg||"").padEnd(20)} ${flags.join(" ") || "clean"}`);
  (r.low || []).forEach((l) => console.log(`    contrast ${l.ratio} < ${l.need}  ${l.px}px  ${l.t}  "${l.txt}"`));
  (r.orange || []).forEach((o) => console.log(`    old accent: ${o}`));
  (r.errList || []).forEach((e) => console.log(`    error: ${e}`));
}
