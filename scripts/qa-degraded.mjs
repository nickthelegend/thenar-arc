/**
 * The station in browsers that are not the happy one.
 *
 * These need their own browser, launched with its own flags, which is why they
 * are not in the page sweep: switching WebGL off is a property of the process,
 * not of the page. They cover the three ways this product can be met by a
 * machine that cannot do what it assumes — no GPU, a run abandoned midway, and
 * a theme change that inverts every surface at once.
 *
 *   node --import ./test/register.mjs scripts/qa-degraded.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createPublicClient, fallback, http } from "viem";
import { AXON_ABI } from "../lib/abi.ts";
import { appChain, RPC_ENDPOINTS, ADDR, need } from "./monad.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";

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

/* ---- G5: a machine whose clock is wrong is told, in the right direction --- */
{
  const seen = [];
  for (const skewMin of [0, 45, -20]) {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    // The only way to see this banner is to be the machine it is about.
    await page.addInitScript((mins) => {
      const shift = mins * 60_000;
      const RealDate = Date;
      // @ts-expect-error replacing the global on purpose, for this page only
      Date = class extends RealDate {
        constructor(...a) { super(...(a.length ? a : [RealDate.now() + shift])); }
        static now() { return RealDate.now() + shift; }
      };
    }, skewMin);
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(9000);
    seen.push(await page.evaluate(() => {
      const m = document.body.innerText.match(/This machine.s clock is (\d+) minutes (ahead of|behind)/i);
      return m ? { minutes: Number(m[1]), direction: m[2].startsWith("ahead") ? "ahead" : "behind" } : null;
    }));
    await page.close();
  }
  const [right, fast, slow] = seen;
  check("G5",
        right === null &&
        fast?.direction === "ahead" && Math.abs(fast.minutes - 45) <= 1 &&
        slow?.direction === "behind" && Math.abs(slow.minutes - 20) <= 1,
        `a wrong clock is named and pointed the right way: ${JSON.stringify(seen)}`);
}

await b.close();

/* ---- G4: the chain half survives losing its primary endpoint ------------- */
{
  // Not a browser check. The failover is a property of the transport, and the
  // interesting case is the one that cannot be produced by loading a page:
  // the endpoint this app reads history from being gone.
  //
  // On Arc this was a million-block log scan, which proved the failover and
  // the range narrowing in one go. Monad's public endpoints answer a hundred
  // blocks of logs at most, so the app reads its history from storage instead,
  // and so does this: the trajectory count and the newest trajectory's hash,
  // read once through the app's own endpoint list and once with the primary
  // replaced by a host that does not exist. Same answer, or the failover lost
  // something on the way.
  const AXON = need(ADDR.axon, "AxonProtocolV2's address (lib/deployment.ts, or NEXT_PUBLIC_AXON_ADDRESS)");
  const read = async (urls) => {
    const c = createPublicClient({
      chain: appChain,
      transport: fallback(
        urls.map((u) => http(u, { retryCount: 1, retryDelay: 200, timeout: 15000 })),
        { rank: false },
      ),
    });
    const n = await c.readContract({ address: AXON, abi: AXON_ABI, functionName: "trajectoryCount" });
    const newest = n > 0n
      ? await c.readContract({ address: AXON, abi: AXON_ABI, functionName: "getTrajectory", args: [n - 1n] })
      : null;
    return { runs: Number(n), newest: newest?.trajHash ?? null };
  };

  const healthy = await read(RPC_ENDPOINTS);
  const degraded = await read([
    "https://this-endpoint-does-not-exist.thenar.invalid/rpc",
    ...RPC_ENDPOINTS.slice(1),
  ]);
  check("G4", healthy.runs > 0 && degraded.runs === healthy.runs && degraded.newest === healthy.newest,
        `losing the primary costs latency, not history: ${healthy.runs} runs found, ${degraded.runs} with it gone`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} pass`);
process.exit(passed === results.length ? 0 : 1);
