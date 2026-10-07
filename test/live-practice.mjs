/**
 * Live, against any deployment: a signed-out practice run, and a product's 3D model.
 *
 *   BASE=https://app.thenar.io LABS=https://thenar.io node test/live-practice.mjs
 *
 * 1. /station/0 signed out: "Practise first" runs, the keyboard places the
 *    payload in its ring, and the after-run button says there is nothing to
 *    submit, is disabled, and pressing it opens no sign-in.
 * 2. A product page's "View in 3D" draws its model: the GLB is fetched and the
 *    canvas has lit pixels.
 * Headed Chromium, because both draw with WebGL and requestAnimationFrame.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3336";
const LABS = process.env.LABS ?? BASE;
const log = (k, v) => console.log(k.padEnd(10), typeof v === "string" ? v : JSON.stringify(v));
const until = async (fn, ms, what) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

/** Drive task 0's payload into its ring with the keyboard (the journey test's route). */
async function placeIt(page) {
  const text = () => page.evaluate(() => document.body.innerText);
  await page.locator("canvas").first().hover();
  const tool = async () => {
    const m = (await text()).match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  await until(tool, 10_000, "the tool readout");
  const KEYS = [["w", "s"], ["a", "d"], ["e", "q"]];
  const SPEED = 0.42;
  const goTo = async (goal, tol = 0.004) => {
    for (let pass = 0; pass < 8; pass++) {
      const now = await tool();
      const e = goal.map((g, i) => g - now[i]);
      if (Math.hypot(...e) < tol) return now;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(e[i]) < tol / 2) continue;
        const k = KEYS[i][e[i] > 0 ? 0 : 1];
        await page.keyboard.down(k);
        await page.waitForTimeout(Math.max(16, (Math.abs(e[i]) / SPEED) * 1000 * (pass ? 0.8 : 0.95)));
        await page.keyboard.up(k);
        await page.waitForTimeout(120);
      }
    }
    return tool();
  };
  const jaws = async () => { await page.keyboard.press(" "); await page.waitForTimeout(500); };
  await goTo([0.22, 0.14, 0.12]);
  await goTo([0.22, 0.14, 0.05]);
  await jaws();
  await goTo([0.22, 0.14, 0.16]);
  await goTo([0.16, -0.18, 0.16]);
  await goTo([0.16, -0.18, 0.07]);
  await jaws();
  await goTo([0.16, -0.18, 0.18], 0.01);
  await until(async () => /IN TOLERANCE|OUT OF TOLERANCE/.test(await text()), 20_000, "the verdict");
  return (await text()).match(/(IN|OUT OF) TOLERANCE/)[1];
}

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"], executablePath: process.env.CHROMIUM });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/station/0`);
  const practise = page.getByRole("button", { name: /^Practise first/ });
  await practise.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await practise.click();
  await until(async () => /end run/i.test(await page.evaluate(() => document.body.innerText)), 10_000, "the run");
  const v = await placeIt(page);
  log("verdict", v);
  assert.equal(v, "IN", "the practice run was placed");
  const btn = page.getByRole("button", { name: "Practice run — nothing to submit" });
  await btn.waitFor({ timeout: 5000 });
  assert.equal(await btn.isDisabled(), true, "the practice button is disabled");
  await btn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  const signIn = await page.evaluate(() => Boolean(document.querySelector("#privy-dialog")) || localStorage.getItem("thenar:localnet:connected") === "1");
  log("sign-in", signIn ? "opened (wrong)" : "none opened");
  assert.equal(signIn, false, "pressing it opened no sign-in");

  await page.goto(`${LABS}/products/arms`);
  await page.getByRole("button", { name: /View in 3D/ }).click();
  const glb = await page.waitForResponse((r) => /\.glb$/.test(new URL(r.url()).pathname), { timeout: 30_000 });
  await page.waitForTimeout(3000);
  // A WebGL canvas reads back blank once its frame is presented, so the
  // pixels are counted from a screenshot of the dialog instead.
  const box = await page.locator("[role=dialog] canvas").boundingBox();
  const png = await page.screenshot({ clip: box });
  const lit = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const g = document.createElement("canvas");
    g.width = 64; g.height = 64;
    const x = g.getContext("2d");
    x.drawImage(img, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n;
  }, png.toString("base64"));
  log("model", `${new URL(glb.url()).pathname} ${glb.status()}, ${lit} lit of 4096 sample pixels`);
  assert.equal(glb.status(), 200, "the model was served");
  assert.ok(lit > 40, "the model is drawn");

  log("errors", errors);
  assert.deepEqual(errors, []);
  console.log("LIVE PRACTICE: PASS");
} finally {
  await browser.close();
}
