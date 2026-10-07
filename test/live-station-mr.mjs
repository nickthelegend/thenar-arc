/**
 * Live: putting the arm on a real table in mixed reality, in a headed Chromium
 * with Meta's WebXR emulator (IWER) standing in for a Quest.
 *
 *   IWER=path/to/iwer.bundle.js BASE=http://localhost:3338 TASK=0 node test/live-station-mr.mjs
 *
 * The emulator has no room to scan, so the test gives it one: a table top
 * 0.74 m up and 0.6 m ahead, answered through the WebXR hit-test API the way
 * a Quest answers once it has found the surface. The page is expected to ask
 * the operator to aim, show where the arm will stand once the table answers,
 * and set it down when the trigger is pulled; after that A begins a run and
 * the trigger no longer places anything. No wallet, no transaction.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

/**
 * IWER 2.5 builds an offset reference space from the XRRigidTransform object
 * itself rather than its matrix, so every offset comes out as identity and a
 * page that places its scene with getOffsetReferenceSpace (as three.js does,
 * and as this station does) looks unplaced. A Quest applies the offset; so
 * does the emulator once it is handed the matrix.
 */
const FIX_IWER_OFFSETS = `(() => {
  const xr = navigator.xr, request = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const s = await request(mode, init);
    const proto = Object.getPrototypeOf(await s.requestReferenceSpace("local-floor"));
    if (!proto.__offsetFixed) {
      const offset = proto.getOffsetReferenceSpace;
      proto.getOffsetReferenceSpace = function (t) { return offset.call(this, t && t.matrix ? t.matrix : t); };
      proto.__offsetFixed = true;
    }
    return s;
  };
})();`;

const BASE = process.env.BASE ?? "http://localhost:3338";
const TASK = process.env.TASK ?? "0";
const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
await page.addInitScript({ content: readFileSync(process.env.IWER, "utf8") });
await page.addInitScript({ content: FIX_IWER_OFFSETS });
await page.addInitScript(() => {
  // A table the emulator can find, switched on by the test once it is aiming.
  window.__table = false;
  const xr = navigator.xr, request = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const s = await request(mode, init);
    if (mode !== "immersive-ar") return s;
    // The page asks for hit poses in local-floor, the session's own base space.
    const surface = new XRRigidTransform({ x: 0.05, y: 0.74, z: -0.6 });
    s.requestHitTestSource = async () => ({ cancel() {} });
    const raf = s.requestAnimationFrame.bind(s);
    s.requestAnimationFrame = (cb) => raf((t, frame) => {
      frame.getHitTestResults = () => (window.__table ? [{ getPose: () => ({ transform: surface }) }] : []);
      // The renderer asks for the viewer first each frame, in the bench's space:
      // that pose is where the operator's head is relative to the arm's base.
      let first = true;
      const viewerPose = frame.getViewerPose.bind(frame);
      frame.getViewerPose = (space) => {
        const vp = viewerPose(space);
        if (first && vp) window.__head = ["x", "y", "z"].map((k) => +vp.transform.position[k].toFixed(3));
        first = false;
        return vp;
      };
      cb(t, frame);
    });
    return s;
  };
});
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
const log = (k, v) => console.log(k, JSON.stringify(v));
const hud = () => page.evaluate(() => document.documentElement.dataset.xrHud ?? "");

try {
  await page.goto(`${BASE}/station/${TASK}`);
  const table = page.getByRole("button", { name: "Put it on my table" }).first();
  await table.waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector("canvas"), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await table.click();
  await page.getByRole("button", { name: "In the headset" }).waitFor({ timeout: 20000 });

  await page.waitForTimeout(800);
  const aiming = await hud();
  log("aiming", aiming);
  assert.match(aiming, /Put the arm on your table/);
  assert.match(aiming, /Point the controller at your table/);

  // The table answers: the page offers to set the arm down there.
  await page.evaluate(() => { window.__table = true; });
  await page.waitForTimeout(600);
  const found = await hud();
  log("found", found);
  assert.match(found, /Pull the trigger to place it here/);
  // The arm's base is on the table where the controller points, its reach
  // the way the operator faces: from the base, the head is 0.6 m back and
  // 0.86 m up (eyes at 1.6 m, table at 0.74 m), and 0.05 m to one side.
  const head = await page.evaluate(() => window.__head);
  log("head-from-base", head);
  const expect = [-0.6, 0.86, -0.05];
  assert.ok(head && head.every((v, i) => Math.abs(v - expect[i]) < 0.02), `the bench stands on the table (${head})`);

  // Trigger: placed. The HUD turns to driving. The trigger is still held when
  // A begins the run, and that held trigger must not close the jaws: it was
  // pulled to place the arm, not to grip.
  const after = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const r = window.xrDevice.controllers.right;
    const jaw = () => document.body.innerText.match(/Jaw\s+(\d+)\s*mm/)?.[1] ?? null;
    r.updateButtonValue("trigger", 1);
    await wait(400);
    const placed = document.documentElement.dataset.xrHud ?? "";
    r.updateButtonValue("a-button", 1); await wait(300); r.updateButtonValue("a-button", 0); await wait(700);
    const running = /end run/i.test(document.body.innerText);
    const jawWhileHeld = jaw();
    r.updateButtonValue("trigger", 0);
    await wait(300);
    // A fresh pull, after letting go, does close them.
    r.updateButtonValue("trigger", 1);
    await wait(700);
    const jawOnPull = jaw();
    r.updateButtonValue("trigger", 0);
    await wait(500);
    return { placed, running, jawWhileHeld, jawOnPull };
  });
  log("placed", after);
  assert.doesNotMatch(after.placed, /Put the arm on your table/, "the trigger set the arm down");
  assert.match(after.placed, /Grip to take hold/);
  assert.equal(after.running, true, "A began a run on the table");
  assert.equal(after.jawWhileHeld, "42", "the placing trigger left the jaws open");
  assert.ok(Number(after.jawOnPull) < 42, `a fresh pull closed the jaws (${after.jawOnPull} mm)`);

  // B picks the arm up again for another spot.
  await page.evaluate(async () => {
    const r = window.xrDevice.controllers.right;
    r.updateButtonValue("b-button", 1); await new Promise((s) => setTimeout(s, 300)); r.updateButtonValue("b-button", 0);
  });
  await page.waitForTimeout(500);
  const again = await hud();
  log("re-place", again);
  assert.match(again, /Put the arm on your table/);

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/station-mr.png` });
  log("console-errors", errors);
  assert.deepEqual(errors, []);
  console.log("LIVE STATION MR: PASS");
} finally {
  await browser.close();
}
