/** Record the landing hero and measure whether the payload is ever teleported. */
import { chromium } from "playwright";
const OUT = process.argv[2] ?? "/tmp/thenar-hero";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("https://thenar.io/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector("canvas")?.scrollIntoView({ block: "center" }));
await page.waitForTimeout(1500);

const c = await page.evaluate(() => {
  const el = document.querySelector("canvas"); const r = el?.getBoundingClientRect();
  return { w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0), sized: !!el?.getAttribute("width") };
});
console.log(`  hero canvas ${c.w}x${c.h}  renderer initialised: ${c.sized}`);

// Two full cycles at 9.2s each, plus a little.
await page.waitForTimeout(21000);
console.log(`  console errors: ${errors.length}`);
await ctx.close();
const v = await page.video()?.path();
await browser.close();
console.log("video:", v);
