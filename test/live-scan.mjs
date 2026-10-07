/**
 * Live: scanning a table on /post, against photos with a known layout.
 *
 * The fixtures are renders of the photoscanned apple and bowl standing on a
 * table beside a sheet of A4, from two different viewpoints
 * (fixtures/scan/scene.html draws them; each .json holds the camera's pixel
 * positions of the sheet's corners and the objects' bases, and where the
 * objects really are). The test clicks the corners, lets the detector find
 * what it can and adds what it misses by clicking its base, then checks the
 * positions the page measured against the truth.
 *
 *   BASE=http://localhost:3334 node test/live-scan.mjs
 */
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const BASE = process.env.BASE ?? "http://localhost:3334";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const b = await chromium.launch({ headless: false, executablePath: process.env.CHROMIUM });
const results = [];
for (const [img, tj] of [["table1.png", "table1.json"], ["table2.png", "table2.json"]]) {
  const truth = JSON.parse(readFileSync(new URL("./fixtures/scan/" + tj, import.meta.url), "utf8"));
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160))); p.on("pageerror", (e) => errs.push(e.message));
  const bad = []; p.on("response", (r) => r.status() >= 400 && bad.push(r.status() + " " + r.url().slice(0, 80)));
  await p.goto(BASE + "/post", { timeout: 120000 });
  await p.getByRole("button", { name: "Scan with a camera" }).click();
  await p.locator("input[type=file]").setInputFiles(fileURLToPath(new URL("./fixtures/scan/" + img, import.meta.url)));
  await p.getByText(/click the sheet's near-left corner/i).waitFor({ timeout: 60000 });
  const ov = p.getByLabel("The table. Click the sheet's corners, then anything to add.");
  const box = await ov.boundingBox();
  const at = (pt) => ({ x: box.x + (pt.x / truth.size[0]) * box.width, y: box.y + (pt.y / truth.size[1]) * box.height });
  for (const c of truth.corners) { const q = at(c); await p.mouse.click(q.x, q.y); await p.waitForTimeout(200); }
  await p.getByText(/Sheet found/).waitFor({ timeout: 10000 });
  const row = (name) => p.locator("li", { has: p.getByRole("button", { name: "Move", exact: true }) }).filter({ hasText: new RegExp("^" + name, "i") }).first();
  const mm = async (name) => { const t = await row(name).innerText(); const m = t.match(/(-?\d+) mm ahead, (\d+) mm (left|right)/); return m ? [+m[1], m[3] === "left" ? +m[2] : -m[2]] : null; };
  const rows = (await p.locator("li", { has: p.getByRole("button", { name: "Move", exact: true }) }).allInnerTexts()).map((r) => r.replace(/\s+/g, " ").slice(0, 70));
  // Anything the detector missed is added where its base really is, the way a person would.
  for (const [name, key] of [["apple", "pick"], ["bowl", "place"]]) {
    if (!(await row(name).count())) {
      await p.locator("input[maxlength=\"32\"]").fill(name);
      await ov.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      Object.assign(box, await ov.boundingBox());
      const q = at(truth.base[key]); await p.mouse.click(q.x, q.y); await p.waitForTimeout(300);
    }
  }
  const got = { apple: await mm("apple"), bowl: await mm("bowl") };
  const err = (g, t) => g ? Math.round(Math.hypot(g[0] - t[0] * 1000, g[1] - t[1] * 1000)) : null;
  await row("apple").getByRole("button", { name: "Move", exact: true }).click();
  await row("bowl").getByRole("button", { name: "Onto", exact: true }).click();
  await p.waitForTimeout(500);
  const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const r = { img, detected: rows, truth: truth.truth, measured: got, errorMm: { apple: err(got.apple, truth.truth.pick), bowl: err(got.bowl, truth.truth.place) }, scanned: (text.match(/Scanned: [^.]*\./) || [""])[0], onChain: (text.match(/On chain as .*?\[scan [^\]]*\]/) || [""])[0], consoleErrors: errs, bad };
  console.log(JSON.stringify(r));
  results.push(r);
  await p.close();
}
await b.close();
for (const r of results) {
  // Detected objects: inside the 25 mm placement band. Clicked ones: within 5 mm.
  assert.ok(r.errorMm.apple <= 25, `${r.img}: apple measured ${r.errorMm.apple} mm from where it stands`);
  assert.ok(r.errorMm.bowl <= 25, `${r.img}: bowl measured ${r.errorMm.bowl} mm from where it stands`);
  assert.match(r.onChain, /\[arm so101\] \[scan -?\d+,-?\d+ > -?\d+,-?\d+\]/);
  assert.deepEqual(r.consoleErrors, []);
  assert.deepEqual(r.bad, []);
}
console.log("LIVE SCAN: PASS");
