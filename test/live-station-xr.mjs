/**
 * Live: the station's headset path, end to end, in a headed Chromium with
 * Meta's WebXR emulator (IWER) standing in for a Quest.
 *
 *   IWER=path/to/iwer.bundle.js BASE=http://localhost:3334 TASK=0 node test/live-station-xr.mjs
 *
 * IWER.bundle is `import { XRDevice, metaQuest3 } from "iwer"; new XRDevice(metaQuest3)
 * .installRuntime({ forceInstall: true })`, bundled as an IIFE that sets window.xrDevice.
 *
 * It enters VR, presses A to begin a run, squeezes to take hold of the arm and
 * carries the payload to the goal by moving the controller, closes and opens
 * the jaws with the trigger, and expects the page to measure a placed run.
 * No wallet is connected, so nothing is submitted and no transaction is sent.
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

const BASE = process.env.BASE ?? "http://localhost:3334";
const TASK = process.env.TASK ?? "0";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
await page.addInitScript({ content: readFileSync(process.env.IWER, "utf8") });
await page.addInitScript({ content: FIX_IWER_OFFSETS });
await page.addInitScript(() => {
  // The renderer asks for the viewer first each frame, in the bench's space:
  // that pose is where the operator's head is relative to the arm's base.
  const xr = navigator.xr, request = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const s = await request(mode, init);
    const raf = s.requestAnimationFrame.bind(s);
    s.requestAnimationFrame = (cb) => raf((t, frame) => {
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
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
const log = (k, v) => console.log(k, JSON.stringify(v));

try {
  await page.goto(`${BASE}/station/${TASK}`);
  // On an emulated Quest the station's Quest panel holds the headset buttons.
  const vr = page.getByRole("button", { name: "Enter in VR" }).first();
  await vr.waitFor({ timeout: 90000 });
  log("buttons", await page.locator("button", { hasText: /Enter in VR|on my table/ }).allTextContents());
  await vr.click();
  await page.getByRole("button", { name: "In the headset" }).waitFor({ timeout: 20000 });
  // The bench comes to the operator: eyes 0.3 m behind the arm's base and
  // 0.5 m above its table, as at a real bench.
  await page.waitForTimeout(800);
  const head = await page.evaluate(() => window.__head);
  log("head-from-base", head);
  assert.ok(head && Math.abs(head[0] + 0.3) < 0.01 && Math.abs(head[1] - 0.5) < 0.01 && Math.abs(head[2]) < 0.01, `the bench was brought in front (${head})`);

  const result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const d = window.xrDevice, r = d.controllers.right;
    const press = async (id) => (r.updateButtonValue(id, 1), await wait(300), r.updateButtonValue(id, 0), await wait(300));
    // The tool's position as the page's own readout shows it (arm frame, metres).
    const tool = () => {
      const t = document.body.innerText.match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
      return t ? [+t[1], +t[2], +t[3]] : null;
    };
    await wait(800);
    await press("a-button"); // begin the run
    await wait(600);
    const running = /end run/i.test(document.body.innerText);
    r.updateButtonValue("squeeze", 1);
    await wait(300);
    // Learn how a controller move maps onto the tool, then steer by it: the
    // bench was placed facing the operator, so the two frames are rotated.
    const at = () => ({ x: r.position.x, y: r.position.y, z: r.position.z });
    const nudge = async (v) => {
      const p = at();
      for (let i = 1; i <= 12; i++) (r.position.set(p.x + (v[0] * i) / 12, p.y + (v[1] * i) / 12, p.z + (v[2] * i) / 12), await wait(30));
      await wait(250);
    };
    // The readout trails the controller by a frame or two; read it once it stops moving.
    const settled = async () => {
      let last = tool();
      for (let i = 0; i < 20; i++) {
        await wait(80);
        const now = tool();
        if (now && last && now.every((v, k) => Math.abs(v - last[k]) < 0.0005)) return now;
        last = now;
      }
      return last;
    };
    // Each axis is tried both ways and the cleaner side kept: from the home
    // pose one direction can run into the arm's own kinematic limit (the IK
    // stops short), which says nothing about how the headset maps the hand.
    const probe = async (axis) => {
      const sides = [];
      for (const sign of [1, -1]) {
        const before = await settled(), v = [0, 0, 0];
        v[axis] = 0.04 * sign;
        await nudge(v);
        const after = await settled();
        v[axis] = -0.04 * sign;
        await nudge(v);
        sides.push(after.map((a, i) => (a - before[i]) / (0.04 * sign)));
      }
      return sides.reduce((best, c) => (Math.abs(Math.hypot(...c) - 1) < Math.abs(Math.hypot(...best) - 1) ? c : best));
    };
    const M = [await probe(0), await probe(1), await probe(2)]; // columns: tool delta per controller axis
    const follow = M.map((c) => Math.hypot(...c)); // should all be ~1: millimetre for millimetre
    // Solve M * c = e for the controller move c that gives tool error e.
    const inv = (m) => {
      const [a, b, c] = m; // columns
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
      return [cross(b, c), cross(c, a), cross(a, b)].map((row) => row.map((x) => x / det));
    };
    const Mi = inv(M);
    const goTo = async (goal) => {
      for (let k = 0; k < 4; k++) {
        const now = tool(), e = goal.map((g, i) => g - now[i]);
        if (Math.hypot(...e) < 0.004) break;
        await nudge(Mi.map((row) => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]));
      }
      return tool();
    };
    await goTo([0.22, 0.14, 0.12]);
    await goTo([0.22, 0.14, 0.05]);
    r.updateButtonValue("trigger", 1);
    await wait(500);
    const held = /HELD|holding/i.test(document.body.innerText);
    await goTo([0.22, 0.14, 0.16]);
    await goTo([0.16, -0.18, 0.16]);
    await goTo([0.16, -0.18, 0.08]);
    r.updateButtonValue("trigger", 0);
    await wait(400);
    r.updateButtonValue("squeeze", 0);
    await goTo([0.16, -0.18, 0.18]);
    // The page measures the run once the payload has been down 0.7 s.
    for (let i = 0; i < 30 && !/Measured|Not placed|score/i.test(document.body.innerText.slice(0, 20000)); i++) await wait(300);
    return { running, follow: follow.map((v) => +v.toFixed(3)), M: M.map((c) => c.map((v) => +v.toFixed(3))), held, text: document.body.innerText.match(/(Deviation|deviation)[^\n]*\n?[^\n]*/g)?.slice(0, 3) ?? [], hud: window.__hud ?? null };
  });
  log("run", result);
  const verdict = await page.evaluate(() => document.body.innerText);
  const measured = /Measurement taken|In tolerance|Out of tolerance|Placed|Measured/i.test(verdict);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/station-xr.png` });
  log("verdict-snippet", verdict.split("\n").filter((l) => /score|mm|placed|Placed|practice|wallet/i.test(l)).slice(0, 12));
  assert.equal(result.running, true, "A began a run");
  assert.ok(result.follow.every((f) => Math.abs(f - 1) < 0.05), `the tool followed the controller 1:1 (${result.follow})`);
  assert.equal(result.held, true, "the trigger closed the jaws on the payload");
  assert.ok(measured, "the run was measured");
  // The recording the station kept is one the verifier will sign: the arm in
  // it moved the payload (lib/coherence.ts physicalityOf, run before signing).
  const draft = await page.evaluate(() => sessionStorage.getItem("thenar:run-draft:v1"));
  if (draft && process.env.PHYSICALITY_OUT) (await import("node:fs")).writeFileSync(process.env.PHYSICALITY_OUT, draft);
  log("draft-samples", draft ? JSON.parse(draft).samples?.length ?? null : null);
  log("console-errors", errors);
  log("failed-requests", failed);
  assert.deepEqual(errors, []);
  console.log("LIVE STATION XR: PASS");
} finally {
  await browser.close();
}
