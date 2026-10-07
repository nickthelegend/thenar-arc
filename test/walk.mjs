/**
 * Every screen, on a phone and on a laptop: does it render, cleanly, at that width?
 *
 *   BASE=http://localhost:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/walk.mjs
 *
 * Needs the local chain and the local build (pnpm demo). For every page route
 * in app/, at 375 × 812 and 1280 × 800, it checks four things:
 * - the page answers with the status it should (a missing licence 404s);
 * - it has a visible heading;
 * - nothing is wider than the screen;
 * - the console holds no error and no request failed.
 * The ids it visits (a task, a run, an operator, a transaction) are read from
 * the local chain and database, not invented.
 *
 * Headless Chromium with SwiftShader, so the WebGL scenes draw too.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createPublicClient, http, parseAbi } from "viem";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";

const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const AXON = LOCAL_DEPLOYMENT.contracts.axon;
const chain = createPublicClient({ transport: http(RPC) });

// Real ids from this chain and its database.
const sql = (q) => execFileSync("sqlite3", [".data/localnet.db", q], { encoding: "utf8" }).trim();
const [hash, operator, tx] = sql("select traj_hash, contributor, tx_hash from trajectory where tx_hash is not null order by created_at desc limit 1;").split("|");
const policies = Number(await chain.readContract({ address: AXON, abi: parseAbi(["function policyCount() view returns (uint256)"]), functionName: "policyCount" }));
assert.ok(hash && operator && tx, "run test/live-localnet.mjs once first: the walk visits a real run");

const ROUTES = [
  ["/", 200], ["/hub", 200], ["/agents", 200], ["/archive", 200], ["/changelog", 200], ["/contracts", 200],
  ["/corpus", 200], ["/corpus?task=0", 200], ["/corpus-token", 200], [`/explorer/address/${AXON}`, 200], [`/explorer/tx/${tx}`, 200],
  ["/foundry", 200], ["/handheld", 200], ["/inventory", 200], ["/lab", 200], ["/leaderboard", 200], ["/localnet", 200],
  ["/offline", 200], [`/operator/${operator}`, 200], ["/passkey", 200], ["/policies", 200], ["/portfolio", 200], ["/post", 200],
  ["/products", 200], ["/products/thenar", 200], ["/q/0", 200], [`/run/${hash}`, 200], ["/space", 200], ["/spec", 200],
  ["/spec/so101", 200], ["/station/0", 200], ["/status", 200], ["/task/0", 200], ["/thenar", 200], ["/start", 200], ["/network", 200],
  ["/licence/0", policies > 0 ? 200 : 404], ["/task/999", 404], ["/no-such-page", 404],
];
const VIEWPORTS = [{ name: "375", width: 375, height: 812 }, { name: "1280", width: 1280, height: 800 }];

const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROMIUM,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const results = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const [route, want] of ROUTES) {
      const page = await ctx.newPage();
      const problems = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // An expected 404 logs its own document load; that is the status being checked, not a fault.
        if (want === 404 && /status of 404/.test(m.text())) return;
        problems.push(`console: ${m.text().slice(0, 160)}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
      page.on("response", (r) => {
        const u = r.url();
        if (r.status() >= 400 && !(want === 404 && u === `${BASE}${route}`)) problems.push(`${r.status()} ${u.replace(BASE, "")}`);
      });
      page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && problems.push(`failed ${r.url().replace(BASE, "")} ${r.failure()?.errorText}`));
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const status = res?.status() ?? 0;
      const shape = await page.evaluate(() => {
        const h1 = [...document.querySelectorAll("h1")].find((h) => h.getBoundingClientRect().height > 0 && getComputedStyle(h).visibility !== "hidden");
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed"; })
          .filter((el) => !el.closest("[data-scroll-x], pre, code, table, canvas, .overflow-x-auto, .overflow-auto, .overflow-x-scroll"))
          .slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} (${Math.round(el.getBoundingClientRect().right)}px)`);
        return { h1: h1?.textContent?.trim().slice(0, 60) ?? null, scroll: document.documentElement.scrollWidth, wide };
      });
      if (status !== want) problems.push(`status ${status}, want ${want}`);
      if (!shape.h1) problems.push("no visible h1");
      if (shape.scroll > vp.width + 1) problems.push(`page is ${shape.scroll}px wide: ${shape.wide.join(", ")}`);
      results.push({ vp: vp.name, route, status, h1: shape.h1, problems });
      console.log(`${problems.length ? "FAIL" : "ok  "} ${vp.name.padEnd(5)} ${route.padEnd(40).slice(0, 40)} ${problems.join(" | ").slice(0, 300)}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => r.problems.length);
console.log(`\n${results.length - failed.length}/${results.length} screens clean`);
assert.equal(failed.length, 0, `${failed.length} screens have problems`);
console.log("WALK: PASS");
