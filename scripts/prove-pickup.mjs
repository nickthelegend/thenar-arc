/**
 * Drive the real deployed station in a headless browser and record it.
 *
 * A headless browser is not throttled the way a hidden pane is, so the frame
 * loop actually runs and the arm can be driven for real. Every assertion below
 * reads the app's own on-screen telemetry — nothing is simulated here.
 */
import { chromium } from "playwright";

const URL = process.argv[2] ?? "https://thenar.io/station/0";
const OUT = process.argv[3] ?? "/tmp/thenar-proof";

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

const readout = async () => page.evaluate(() => {
  const t = document.body.innerText;
  return {
    dist: (t.match(/PAYLOAD\s+([\d.]+)\s*m/) || [])[1] ?? null,
    inRange: /IN RANGE/.test(t),
    overIt: /OVER THE PAYLOAD/.test(t),
    held: /PAYLOAD HELD/.test(t),
    xyz: (t.match(/X\s[-\d.]+\s+Y\s[-\d.]+\s+Z\s[-\d.]+/) || [])[0]?.replace(/\n/g, " "),
    dev: (t.match(/([-+][\d.]+)\s*mm/) || [])[1] ?? null,
    verdict: /Measurement taken/.test(t) ? t.match(/Measurement taken[^|]*/)?.[0] : null,
    elapsed: (t.match(/ELAPSED\s*\n?\s*([\d:.]+)/) || [])[1] ?? null,
  };
});

const say = (m) => console.log(m);

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);

// Canvas must actually be running before any of this means anything.
const canvas = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const r = c?.getBoundingClientRect();
  return { w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0), sized: !!c?.getAttribute("width") };
});
say(`  canvas ${canvas.w}x${canvas.h}  renderer initialised: ${canvas.sized}`);
if (!canvas.sized || canvas.w < 400) { console.log("FAIL: canvas never initialised"); process.exit(1); }

await page.getByRole("button", { name: /begin run/i }).click();
await page.waitForTimeout(1500);
let s = await readout();
say(`  run started — tool ${s.xyz} · payload ${s.dist} m away`);

// 1. swing toward the payload until the plane distance is inside capture
await page.keyboard.down("a");
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  s = await readout();
  if (s.inRange || s.overIt || (s.dist !== null && +s.dist < 0.05)) break;
}
await page.keyboard.up("a");
await page.waitForTimeout(300);
s = await readout();
say(`  after A: payload ${s.dist ?? "-"} m · over it: ${s.overIt} · in range: ${s.inRange}`);

// 2. descend until the jaws are at the payload's height
if (!s.inRange) {
  await page.keyboard.down("q");
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    s = await readout();
    if (s.inRange) break;
  }
  await page.keyboard.up("q");
  await page.waitForTimeout(300);
  s = await readout();
}
say(`  after Q: in range: ${s.inRange} · tool ${s.xyz}`);
if (!s.inRange) { console.log("FAIL: never reached the capture volume"); await ctx.close(); await browser.close(); process.exit(1); }

// 3. one press of space
await page.keyboard.press("Space");
await page.waitForTimeout(900);
s = await readout();
say(`  SPACE -> PAYLOAD HELD: ${s.held}`);
if (!s.held) { console.log("FAIL: space did not close on the payload"); await ctx.close(); await browser.close(); process.exit(1); }

// 4. carry it to the datum. Steer straight at it from the tool readout rather
//    than hunting: A/D swing the tool in Y, W/S reach in X.
const GOAL = [0.17, -0.24];
const pose = async () => {
  const r = await readout();
  const m = r.xyz?.match(/X\s(-?[\d.]+)\s+Y\s(-?[\d.]+)/);
  return m ? { x: +m[1], y: +m[2], dev: r.dev === null ? null : Math.abs(+r.dev), held: r.held } : null;
};
let p0 = await pose();
say(`  carrying — deviation starts at ${p0?.dev} mm`);
for (let i = 0; i < 90; i++) {
  const p = await pose();
  if (!p || (p.dev !== null && p.dev < 16)) break;
  const dx = GOAL[0] - p.x, dy = GOAL[1] - p.y;
  // drive the larger error first, in short pulses so it never overshoots
  const k = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? "a" : "d") : (dx > 0 ? "w" : "s");
  const err = Math.max(Math.abs(dx), Math.abs(dy));
  await page.keyboard.down(k);
  await page.waitForTimeout(err > 0.08 ? 150 : 55);
  await page.keyboard.up(k);
  await page.waitForTimeout(45);
}
s = await readout();
say(`  carried to the datum — deviation ${s.dev} mm · still held: ${s.held}`);

// 5. release and let it settle
await page.keyboard.press("Space");
await page.waitForTimeout(4000);
s = await readout();
say(`  released -> ${s.verdict ?? "(no verdict yet)"}`);

await page.waitForTimeout(1500);
say(`  console errors: ${errors.length}`);
const ok = s.verdict !== null;
say(ok ? "\n  PICK AND DROP COMPLETED ON THE LIVE SITE\n" : "\n  released but no measurement fired\n");

await ctx.close();
const video = await page.video()?.path();
await browser.close();
console.log("video:", video);
process.exit(ok ? 0 : 1);
