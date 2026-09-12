/**
 * The station in browsers that are not the happy one.
 *
 * These need their own browser, launched with its own flags, which is why they
 * are not in the page sweep: switching WebGL off is a property of the process,
 * not of the page. They cover the three ways this product can be met by a
 * machine that cannot do what it assumes — no GPU, a run abandoned midway, and
 * a theme change that inverts every surface at once.
 *
 *   node scripts/qa-degraded.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://thenar.io";

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(4)} ${detail}`);
};

/* ---- G1: a browser that cannot draw the station says so, and says what --- */
{
  const b = await chromium.launch({ args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] });
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  await page.goto(`${BASE}/station/1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  const r = await page.evaluate(() => ({
    fallback: /cannot draw the station/i.test(document.body.innerText),
    // The task is still named: the visitor should know what they came for.
    names: /needs a WebGL context/i.test(document.body.innerText),
    // And no canvas was mounted, rather than one mounted and thrown away.
    canvas: Boolean(document.querySelector("canvas")),
    ways: /The corpus/i.test(document.body.innerText) && /The contracts/i.test(document.body.innerText),
  }));
  check("G1", r.fallback && r.names && !r.canvas && r.ways && errors.length === 0,
        `no WebGL: ${JSON.stringify(r)}${errors.length ? ` errors=${errors[0]}` : ""}`);
  await b.close();
}

const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=metal"] })
  .catch(() => chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }));

/* ---- G2: a run in progress is not thrown away without a word ------------- */
{
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  // Dispatched directly rather than by closing the tab: whether the browser
  // paints its own dialog is the browser's policy, and what this owns is
  // whether the page asks it to.
  const cancels = () => page.evaluate(() => {
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  await page.goto(`${BASE}/station/1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /begin run/i }).waitFor({ timeout: 60000 });
  const before = await cancels();
  await page.getByRole("button", { name: /begin run/i }).click();
  await page.waitForTimeout(2500);
  const during = await cancels();
  await page.getByRole("button", { name: /end run/i }).click();
  await page.waitForTimeout(2500);
  const after = await cancels();
  // Released once measured, because from there the draft store has the samples
  // and a guard that never lifts is one nobody reads.
  check("G2", !before && during && !after,
        `leaving mid-run is stopped: before=${before} during=${during} after=${after}`);
  await page.close();
}

/* ---- G3: the ground crosses over, and only for the press ----------------- */
{
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const state = () => page.evaluate(() => ({
    shifting: document.documentElement.hasAttribute("data-theme-shifting"),
    props: getComputedStyle(document.body).transitionProperty,
    theme: document.documentElement.dataset.theme ?? "light",
  }));
  const before = await state();
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button"))
      .find((x) => /dark|light|theme/i.test(x.getAttribute("aria-label") ?? x.title ?? x.innerText));
    b?.click();
  });
  const during = await state();
  await page.waitForTimeout(700);
  const after = await state();
  const moved = before.theme !== during.theme;
  const only = !before.shifting && during.shifting && !after.shifting;
  const crosses = /background-color/.test(during.props) && !/background-color/.test(after.props);
  check("G3", moved && only && crosses,
        `theme crossover is scoped to the press: ${before.theme} -> ${during.theme}, shifting only during`);
  await page.close();
}

await b.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} pass`);
process.exit(passed === results.length ? 0 : 1);
