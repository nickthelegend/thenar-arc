/**
 * Live: the SO-101 spec page's bench, and mirroring it through the real arm
 * relay to a follower on a pseudo-terminal that answers like thenar-arms'
 * firmware. Headed Chromium, because WebGL and requestAnimationFrame are what
 * is under test.
 *
 *   BASE=http://localhost:3334 node test/live-so101.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3334";
const SHOTS = process.env.SHOTS;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out");
};
const log = (k, v) => console.log(k, JSON.stringify(v));

const fw = spawn("python3", [fileURLToPath(new URL("./fake-follower.py", import.meta.url))]);
const lines = [];
let path;
fw.stdout.on("data", (d) => { for (const l of String(d).split("\n").filter(Boolean)) path ? lines.push(l) : (path = l); });
await until(() => path);
const relay = spawn(process.execPath, ["scripts/arm-relay.mjs", "--follower", path, "--arm"], { cwd: ROOT });
let relayOut = "";
relay.stdout.on("data", (d) => (relayOut += d));
relay.stderr.on("data", (d) => (relayOut += d));
await until(() => relayOut.includes("THENAR arm relay on"));

const browser = await chromium.launch({ headless: false, args: ["--window-size=1400,1000"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1360, height: 940 } });
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));

try {
  await page.goto(`${BASE}/spec/so101`);
  const readout = page.getByTestId("so101-readout");
  await until(async () => /\d+\.\d°/.test(await readout.innerText()), 90000);
  const reachOf = async () => Number((await readout.innerText()).match(/Reached within\s+(\d+\.\d) mm/)[1]);
  const first = await reachOf();
  log("reach-at-default", first);

  // Move the gripping point: far out and low, then across to the other side.
  const set = async (label, v) => page.getByLabel(label).fill(String(v));
  await set("Tool X, millimetres", 330);
  await set("Tool Z, millimetres", 30);
  await page.waitForTimeout(600);
  const far = await reachOf();
  await set("Tool Y, millimetres", -200);
  await set("Tool X, millimetres", 200);
  await page.waitForTimeout(600);
  const side = await reachOf();
  const jointsText = await readout.innerText();
  log("reach", { far, side });
  log("joints", jointsText.split("\n").filter((l) => /°/.test(l)));
  assert.ok(first < 8 && far < 8 && side < 8, "the CAD chain reached every requested point within 8 mm");

  // Mirror: holds home so the follower arms, eases, then follows live.
  await page.getByRole("button", { name: "Mirror to my SO-101" }).click();
  await until(() => lines.includes("ARM"));
  await page.getByText("Armed. The arm on your desk follows").waitFor({ timeout: 10000 });
  await set("Tool Y, millimetres", 150);
  await page.waitForTimeout(800);
  const qs = lines.filter((l) => l.startsWith("Q ")).map((l) => l.split(" ").slice(1).map(Number));
  const lastQ = qs.at(-1);
  log("follower", { targets: qs.length, first: qs[0], last: lastQ });
  assert.ok(qs.length > 40, "the follower got a stream of targets");
  // What reached the serial line is what the page solved, joint for joint.
  const shown = (await readout.innerText()).match(/-?\d+\.\d(?=°)/g).map(Number);
  log("page-joints", shown);
  shown.forEach((v, i) => assert.ok(Math.abs(v - lastQ[i]) < 1, `joint ${i}: page ${v}°, follower ${lastQ[i]}°`));
  assert.ok(Math.abs(lastQ[0]) > 20, "the base swung to the new side");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/so101-spec.png`, fullPage: false });

  // Closing the page's mirror stops the arm.
  lines.length = 0;
  await page.getByRole("button", { name: "Stop mirroring" }).click();
  await until(() => lines.includes("STOP"));
  log("console-errors", errors);
  log("failed-requests", failed);
  assert.deepEqual(errors, []);
  console.log("LIVE SO-101: PASS");
} finally {
  await browser.close();
  relay.kill();
  fw.kill();
}
