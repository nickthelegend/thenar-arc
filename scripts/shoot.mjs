/**
 * Screenshot the landing page and verify what it claims.
 *
 * The design makes checkable promises — a diagram drawn to scale, a trace whose
 * amplitude is tied to a quoted ratio, a weave the whole hero depends on. This
 * measures each in the DOM rather than trusting a look at it.
 *
 *   node scripts/shoot.mjs http://localhost:PORT [outdir]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.argv[2];
const OUT = process.argv[3] ?? "/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-monad-blitz/c4afa5c0-ea5d-456c-bee5-d383c3d34809/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

for (const [name, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${name}-hero.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });

  if (name === "desktop") {
    const checks = await page.evaluate(() => {
      const out = {};

      // 1. The weave. The front layer must actually paint over the subject and
      //    the back layer under it — the entire hero depends on it and it fails
      //    silently when it fails.
      const back = document.querySelector(".word-back");
      const front = document.querySelector(".word-front");
      const subj = document.querySelector(".subject");
      const z = (el) => el && getComputedStyle(el).zIndex;
      out.weave = { back: z(back), subject: z(subj), front: z(front) };

      // Which letter each layer owns, and whether the owned front letter is
      // geometrically inside the subject's box (otherwise nothing overlaps).
      const vis = (layer) => Array.from(layer.children)
        .map((s, i) => ({ i, ch: s.textContent, shown: !s.hasAttribute("data-off"), r: s.getBoundingClientRect() }))
        .filter((s) => s.shown);
      const fv = vis(front), bv = vis(back);
      out.frontLetters = fv.map((s) => s.ch);
      out.backLetters = bv.map((s) => s.ch);
      const sr = subj.getBoundingClientRect();
      out.subjectBox = { l: Math.round(sr.left), r: Math.round(sr.right), t: Math.round(sr.top), b: Math.round(sr.bottom) };
      out.frontLetterOverlapsSubject = fv.every((s) =>
        s.r.left < sr.right && s.r.right > sr.left && s.r.top < sr.bottom && s.r.bottom > sr.top);
      // Layers must register exactly, or the two halves of the word sit apart.
      out.layersRegister = Math.abs(back.getBoundingClientRect().left - front.getBoundingClientRect().left) < 0.5
        && Math.abs(back.getBoundingClientRect().top - front.getBoundingClientRect().top) < 0.5;

      // 2. The elevation claims to be to scale. Every band's px-per-mm must match.
      const rects = Array.from(document.querySelectorAll("figure svg rect"));
      if (rects.length) {
        const ratios = rects.map((r) => r.height.baseVal.value / 1).filter(Boolean);
        out.bandCount = rects.length;
      }

      // 3. The traces: peak-to-peak of each path, and their ratio.
      const paths = Array.from(document.querySelectorAll("figure svg path")).filter((p) => p.getTotalLength() > 100);
      const extent = (p) => {
        const L = p.getTotalLength();
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i <= 1200; i++) {
          const y = p.getPointAtLength((i / 1200) * L).y;
          if (y < lo) lo = y; if (y > hi) hi = y;
        }
        return hi - lo;
      };
      if (paths.length >= 2) {
        const a = extent(paths[0]), b = extent(paths[1]);
        out.traceAmplitudes = [+a.toFixed(2), +b.toFixed(2)];
        out.traceRatio = +(a / b).toFixed(3);
      }

      out.horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      out.pageScreens = +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1);
      return out;
    });
    console.log(JSON.stringify(checks, null, 1));
  }
  await page.close();
}

// Scale check needs the real mm values, so do it against the source of truth.
const spec = JSON.parse(await import("node:fs").then((m) => m.promises.readFile("lib/arm-spec.json", "utf8")));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });
const scale = await page.evaluate(() => {
  const rects = Array.from(document.querySelectorAll("figure svg rect"));
  return rects.map((r) => r.height.baseVal.value);
});
await page.close();
if (scale.length === spec.links.length) {
  const per = scale.map((h, i) => h / spec.links[i].value_mm);
  const spread = Math.max(...per) - Math.min(...per);
  console.log(`\n  elevation to scale: ${spread < 1e-6 ? "YES" : "NO"}  (px/mm spread ${spread.toExponential(2)})`);
  console.log(`  px per mm = ${per[0].toFixed(5)}`);
} else {
  console.log(`\n  elevation: expected ${spec.links.length} bands, found ${scale.length}`);
}

// Reduced motion must be the finished page, not a degraded one: the js switch
// is never set and nothing is left below full opacity.
const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const rmPage = await rmCtx.newPage();
await rmPage.goto(URL, { waitUntil: "networkidle" });
await rmPage.waitForTimeout(1000);
const rm = await rmPage.evaluate(() => {
  const rv = Array.from(document.querySelectorAll(".rv"));
  return { js: document.documentElement.classList.contains("js"), total: rv.length,
           hidden: rv.filter((e) => +getComputedStyle(e).opacity < 0.99).length };
});
console.log(`\n  reduced motion: js=${rm.js}  reveal nodes=${rm.total}  hidden=${rm.hidden}` +
            `  ${!rm.js && rm.hidden === 0 ? "OK" : "FAIL"}`);
await rmCtx.close();

console.log(`\n  console/page errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log("   ", e));
console.log(`  shots in ${OUT}`);
await browser.close();
