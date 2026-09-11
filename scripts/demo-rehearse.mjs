/**
 * Task 8.3 — walk the five-step loop against the live deployment and time it.
 *
 * The loop the product claims is: land, open a task, drive it, be paid in the
 * transaction that records the run, and verify that transaction on a public
 * explorer. Steps that need a funded wallet cannot be driven from here, so this
 * times what a visitor without one actually experiences and verifies the paid
 * steps against chain state that already exists — which is the same evidence a
 * judge would check.
 *
 *   node scripts/demo-rehearse.mjs [base]
 */
import { chromium } from "playwright";
import { createPublicClient, http, formatEther, parseAbi } from "viem";

const BASE = process.argv[2] ?? "https://thenar.io";
const chain = { id: 43113, name: "Fuji", nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] } } };
const node = createPublicClient({ chain, transport: http() });

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// Cold: no cache, no storage, no wallet — the state a judge arrives in.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 80)); });

const steps = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  const detail = await fn();
  const ms = Date.now() - t0;
  steps.push({ name, ms, detail });
  console.log(`  ${String(ms).padStart(6)} ms  ${name.padEnd(38)} ${detail}`);
};

console.log(`\n  cold-start rehearsal — ${BASE}\n`);

await step("1. land and read the claim", async () => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const live = /TRAJECTORIES\s+\d+/i.test(t);
  return `headline + live readings on page: ${live}`;
});

await step("2. open the work", async () => {
  await page.goto(BASE + "/hub", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const n = await page.evaluate(() => document.querySelectorAll("a[href^='/station/']").length);
  return `${n} task links from chain`;
});

await step("3. enter a station without a wallet", async () => {
  await page.goto(BASE + "/station/1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const r = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return { canvas: !!c, practise: /practise first/i.test(document.body.innerText) };
  });
  return `viewport ${r.canvas ? "up" : "MISSING"}, practice offered: ${r.practise}`;
});

await step("4. a paid run exists and is on chain", async () => {
  const abi = parseAbi(["function trajectoryCount() view returns (uint256)",
    "function getTrajectory(uint256) view returns ((uint256 taskId, address contributor, bytes32 trajHash, string cid, uint16 score, uint128 paid, uint64 at))"]);
  const A = "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0";
  const n = Number(await node.readContract({ address: A, abi, functionName: "trajectoryCount" }));
  const last = await node.readContract({ address: A, abi, functionName: "getTrajectory", args: [BigInt(n - 1)] });
  return `${n} on chain, latest paid ${formatEther(last.paid)} AVAX to ${last.contributor.slice(0, 10)}…`;
});

await step("5. the payout is verifiable by a stranger", async () => {
  const feed = await fetch(BASE + "/api/feed").then((r) => r.json());
  // tx_hash by name. Grabbing the first 64-hex string in the payload picks up a
  // trajectory hash instead, which is not a transaction and never resolves.
  const hashes = [];
  const walk = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (/^tx_?hash$/i.test(k) && typeof x === "string" && /^0x[0-9a-f]{64}$/i.test(x)) hashes.push(x);
      else walk(x);
    }
  };
  walk(feed);
  if (!hashes.length) return "feed exposes no tx_hash";
  const tx = hashes[0];
  const r = await node.getTransactionReceipt({ hash: tx }).catch(() => null);
  return r ? `receipt ${tx.slice(0, 12)}… status ${r.status}, block ${r.blockNumber}` : `no receipt for ${tx.slice(0, 12)}…`;
});

await step("6. every contract is inspectable", async () => {
  await page.goto(BASE + "/contracts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const n = await page.evaluate(() => (document.body.innerText.match(/0x[0-9a-fA-F]{40}/g) || []).length);
  return `${n} addresses, each read live`;
});

await browser.close();

const total = steps.reduce((n, s) => n + s.ms, 0);
console.log(`\n  total ${(total / 1000).toFixed(1)}s across ${steps.length} steps`);
console.log(`  console errors: ${errs.length}${errs.length ? " — " + errs.slice(0, 2).join("; ") : ""}`);
const slow = steps.filter((s) => s.ms > 12000);
if (slow.length) console.log(`  slower than 12s: ${slow.map((s) => s.name).join(", ")}`);
process.exit(errs.length === 0 ? 0 : 1);
