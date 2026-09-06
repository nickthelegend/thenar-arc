/**
 * One raw take of the Axon flow. Real clicks, real arm control read back from
 * the app's own telemetry, and a real testnet transaction signed by a key that
 * never enters the page.
 *
 *   node demo/record.mjs [base-url]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.argv[2] ?? "https://thenar.io";
const OUT = "demo/out";
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const KEY = env.DEPLOYER_PRIVATE_KEY;
if (!KEY) throw new Error("NO_TESTNET_KEY");
const AXON = env.AXON_ADDRESS;

const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };
const account = privateKeyToAccount(KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });
if (chain.id !== 10143) throw new Error("REFUSING_NON_TESTNET");

// Silent cut: each beat is held for a fixed, readable span instead of a
// narration length. Arm beats are driven by the app's state, not the clock.
const HOLDS = {
  intro: 11, "landing-figures": 12, hub: 11, "station-open": 9,
  "station-begin": 7, "station-grasp": 3, "station-place": 3, "station-score": 12,
  sign: 4, confirmed: 9,
  "explorer-tx": 13, "explorer-transfer": 12, "explorer-address": 13, "explorer-contract": 11,
  leaderboard: 10, "task-page": 10, "run-verify": 10,
  foundry: 12, "licence-sign": 4, "licence-paid": 9, "licence-explorer": 13, outro: 8,
};
const durations = Object.fromEntries(Object.entries(HOLDS).map(([k, v]) => [k, v]));
const script = Object.keys(HOLDS).map((id) => ({ id, text: "" }));
const marks = [];
let t0 = 0;
const now = () => Date.now() - t0;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ---------------------------------------------------------------- preflight
const abi = parseAbi([
  "function taskCount() view returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
  "function runsBy(uint256, address) view returns (uint32)",
]);
const count = Number(await pub.readContract({ address: AXON, abi, functionName: "taskCount" }));
let TASK = -1;
for (let i = count - 1; i >= 0; i--) {
  const t = await pub.readContract({ address: AXON, abi, functionName: "getTask", args: [BigInt(i)] });
  if (t.policyMinted || t.slotsFilled >= t.slotsTotal || t.escrow < t.rewardPerTrajectory) continue;
  let mine = 0;
  try { mine = Number(await pub.readContract({ address: AXON, abi, functionName: "runsBy", args: [BigInt(i), account.address] })); } catch {}
  if (mine >= 5) continue;
  TASK = i; break;
}
if (TASK < 0) throw new Error("NO_OPEN_TASK — every task is full, minted or out of escrow");
console.log(`preflight: driving task #${TASK} as ${account.address}`);
const bal = await pub.getBalance({ address: account.address });
if (bal < 10n ** 17n) throw new Error(`LOW_BALANCE ${bal}`);

// ------------------------------------------------------------------ browser
const browser = await chromium.launch({ args: ["--force-device-scale-factor=1", "--hide-scrollbars"] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
await ctx.clearCookies();
const page = await ctx.newPage();

const sent = [];
// The key stays in node. The page can ask for a signature; it never sees one.
await page.exposeFunction("__demoSign", async (tx) => {
  const hash = await wallet.sendTransaction({
    to: tx.to, data: tx.data,
    value: tx.value ? BigInt(tx.value) : undefined,
    gas: tx.gas ? BigInt(tx.gas) : 500000n,
  });
  sent.push(hash);
  return hash;
});
await page.exposeFunction("__demoRpc", async (method, params) => {
  const r = await fetch(chain.rpcUrls.default.http[0], {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message);
  return r.result;
});

await page.addInitScript(({ addr }) => {
  const listeners = {};
  const provider = {
    isMetaMask: true, isDemo: true,
    request: async ({ method, params = [] }) => {
      switch (method) {
        case "eth_requestAccounts": case "eth_accounts": return [addr];
        case "eth_chainId": return "0x279f";
        case "net_version": return "10143";
        case "wallet_switchEthereumChain": case "wallet_addEthereumChain": return null;
        case "eth_sendTransaction": return window.__demoSign(params[0]);
        default: return window.__demoRpc(method, params);
      }
    },
    on: (e, fn) => { (listeners[e] ??= []).push(fn); },
    removeListener: (e, fn) => { listeners[e] = (listeners[e] ?? []).filter((f) => f !== fn); },
  };
  Object.defineProperty(window, "ethereum", { value: provider, writable: false, configurable: true });
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({
        info: { uuid: "axon-demo-0000-0000-000000000000", name: "Demo Wallet", rdns: "xyz.axon.demo",
          icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=" },
        provider,
      }),
    }));
  });
  localStorage.clear();
}, { addr: account.address });

// ------------------------------------------------------- cursor + click ring
await page.addInitScript(() => {
  const install = () => {
    if (document.getElementById("__cur")) return;
    const s = document.createElement("style");
    s.textContent = `#__cur{position:fixed;z-index:2147483647;pointer-events:none;left:0;top:0;
      width:22px;height:22px;margin:-2px 0 0 -2px;transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
      .__ring{position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #FF6A00;border-radius:50%;
      width:14px;height:14px;margin:-7px 0 0 -7px;opacity:.9;animation:__r .5s ease-out forwards}
      @keyframes __r{to{transform:scale(3.2);opacity:0}}
      #__sign{position:fixed;inset:0;z-index:2147483645;background:#0B0B0B;display:flex;align-items:center;
      justify-content:center;flex-direction:column;gap:18px;font-family:ui-monospace,monospace}`;
    document.head.appendChild(s);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    c.id = "__cur"; c.setAttribute("viewBox", "0 0 22 22");
    c.innerHTML = `<path d="M2 1 L2 17 L6.5 13 L9.4 19.6 L12.6 18.2 L9.8 11.8 L15.6 11.6 Z"
      fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`;
    document.body.appendChild(c);
    window.__cur = c;
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
  window.__place = (x, y) => { if (window.__cur) window.__cur.style.transform = `translate(${x}px,${y}px)`; };
  window.__ring = (x, y) => {
    const d = document.createElement("div"); d.className = "__ring";
    d.style.left = x + "px"; d.style.top = y + "px";
    document.body.appendChild(d); setTimeout(() => d.remove(), 520);
  };
});

let cx = 640, cy = 400;
const ease = (t) => 1 - Math.pow(1 - t, 3);
async function glide(x, y, ms = 620) {
  const sx = cx, sy = cy, steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const u = ease(i / steps);
    const nx = sx + (x - sx) * u, ny = sy + (y - sy) * u;
    await page.evaluate(([a, b]) => window.__place?.(a, b), [nx, ny]);
    await sleep(ms / steps);
  }
  cx = x; cy = y;
  await page.mouse.move(x, y);
}
async function clickAt(sel, ms = 620) {
  const el = await page.waitForSelector(sel, { state: "visible", timeout: 20000 });
  const b = await el.boundingBox();
  if (!b) throw new Error(`NO_BOX ${sel}`);
  const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
  await glide(x, y, ms);
  await page.evaluate(([a, b2]) => window.__ring?.(a, b2), [x, y]);
  await sleep(120);
  await el.click();
}
async function until(label, fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (await fn()) return true; await sleep(200); }
  throw new Error(`TIMEOUT_${label}`);
}

// --------------------------------------------------------------- beat timing
const byId = Object.fromEntries(script.map((s) => [s.id, s.text]));
function line(id) {
  if (durations[id] === undefined) throw new Error(`NO_HOLD ${id}`);
  const at = now();
  marks.push({ id, atMs: at, signing: id === "sign" });
  console.log(`DEMO_LINE ${at} ${id}`);
  return at;
}
async function hold(id, since) {
  const want = durations[id] * 1000;
  await sleep(want - (now() - since));
}

// --------------------------------------------------------- arm telemetry I/O
async function tel() {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const n = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    return {
      x: n(/X\s+(-?[\d.]+)/), y: n(/Y\s+(-?[\d.]+)/), z: n(/Z\s+(-?[\d.]+)/),
      held: /PAYLOAD HELD/i.test(t),
      inRange: /IN RANGE/i.test(t),
      dist: n(/PAYLOAD\s+([\d.]+)\s*m/),
      dev: n(/([-+]?[\d.]+)\s*\n?\s*mm\s*±/) ?? n(/DATUM\s*\n?\s*([-+]?[\d.]+)/),
      verdict: /IN TOLERANCE|OUT OF TOLERANCE/i.test(t),
    };
  });
}
async function tap(key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }

/** Coordinate descent on whatever scalar the app is reporting. The driver does
 *  not know the payload's coordinates; it follows the app's own readout.
 *  Tap length is proportional to the remaining error — a fixed tap moves the
 *  tool ~8cm, which can never settle inside a 25mm tolerance. */
async function seek(metric, target, budgetMs, metresPerUnit = 1) {
  const AXES = [["w", "s"], ["a", "d"]];
  const SPEED = 0.42;                    // metres per second, from the rig
  const end = Date.now() + budgetMs;
  const dir = [1, 1];
  const tapFor = (err) =>
    Math.max(30, Math.min(420, (err * metresPerUnit) / SPEED * 1000 * 0.55));

  while (Date.now() < end) {
    const m0 = await metric();
    if (m0 === null) return false;
    if (m0 <= target) return true;

    let improvedAny = false;
    for (let a = 0; a < AXES.length && Date.now() < end; a++) {
      let before = await metric();
      if (before === null || before <= target) return before !== null && before <= target;
      let k = dir[a] === 1 ? AXES[a][0] : AXES[a][1];
      const ms = tapFor(before);
      await tap(k, ms);
      let after = await metric();
      if (after === null) continue;
      if (after > before) {
        // Wrong way: flip this axis and give back the step plus one more.
        dir[a] = -dir[a];
        k = k === AXES[a][0] ? AXES[a][1] : AXES[a][0];
        await tap(k, ms * 2);
        after = await metric();
      }
      if (after !== null && after < before) improvedAny = true;
      if (after !== null && after <= target) return true;
    }
    if (!improvedAny) {
      // Both axes stalled — nudge once so the next pass has a fresh gradient.
      await tap(dir[0] === 1 ? "w" : "s", 60);
    }
  }
  return (await metric()) <= target;
}

// ================================================================= the take
try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  t0 = Date.now();

  let s = line("intro"); await glide(700, 430, 900); await hold("intro", s);

  s = line("landing-figures");
  await page.mouse.wheel(0, 420); await sleep(1600);
  await page.mouse.wheel(0, 420); await sleep(1600);
  await page.mouse.wheel(0, 380);
  await hold("landing-figures", s);

  s = line("hub");
  await page.goto(`${BASE}/hub`, { waitUntil: "networkidle" });
  await until("hub-rows", async () => (await page.locator("a[href^='/station/']").count()) > 0);
  await glide(640, 400, 800); await sleep(1200); await page.mouse.wheel(0, 300);
  await hold("hub", s);

  s = line("station-open");
  await page.goto(`${BASE}/station/${TASK}`, { waitUntil: "networkidle" });
  await until("station-ready", async () => page.locator("text=Begin run").first().isVisible());
  await hold("station-open", s);

  s = line("station-begin");
  await clickAt("button:has-text('Begin run')");
  await until("run-live", async () => (await tel()).x !== null, 15000);
  await hold("station-begin", s);

  s = line("station-grasp");
  await tap("q", 900);
  await seek(async () => (await tel()).dist, 0.070, 26000, 1);
  await until("in-range", async () => (await tel()).inRange, 12000);
  await page.keyboard.press("Space");
  await until("grasped", async () => (await tel()).held, 8000);
  console.log("  grasp confirmed by the app readout");
  await hold("station-grasp", s);

  s = line("station-place");
  let accepted = false;
  for (let attempt = 1; attempt <= 3 && !accepted; attempt++) {
    await tap("e", 420);
    await seek(async () => { const t = await tel(); return t.dev === null ? null : Math.abs(t.dev); }, 15, 30000, 0.001);
    await tap("q", 360);
    await seek(async () => { const t = await tel(); return t.dev === null ? null : Math.abs(t.dev); }, 11, 8000, 0.001);
    await page.keyboard.press("Space");
    await until("verdict", async () => (await tel()).verdict, 20000);
    const txt = await page.locator("body").innerText();
    accepted = /IN TOLERANCE/i.test(txt) && !/OUT OF TOLERANCE/i.test(txt);
    console.log(`  attempt ${attempt}: ${accepted ? "IN TOLERANCE" : "out of tolerance"}`);
    if (!accepted) {
      const again = page.locator("button:has-text('Run again')").first();
      if (!(await again.isVisible().catch(() => false))) break;
      await again.click();
      await until("re-armed", async () => (await tel()).x !== null && !(await tel()).verdict, 15000);
      await tap("q", 800);
      await seek(async () => (await tel()).dist, 0.070, 22000, 1);
      await until("in-range-again", async () => (await tel()).inRange, 12000);
      await page.keyboard.press("Space");
      await until("grasped-again", async () => (await tel()).held, 8000);
    }
  }
  if (!accepted) throw new Error("RUN_REJECTED — could not place the payload in tolerance");
  await hold("station-place", s);

  s = line("station-score");
  await page.mouse.wheel(0, 200);
  await hold("station-score", s);

  await until("connected", async () => /submit and get paid/i.test(await page.locator("body").innerText()), 30000);

  // ------------------------------------------------ signing beat (real tx)
  s = line("sign");
  const before = sent.length;
  const submit = page.locator("button", { hasText: /submit and get paid/i }).first();
  await submit.waitFor({ state: "visible", timeout: 20000 });
  const sb = await submit.boundingBox();
  if (sb) { await glide(Math.round(sb.x + sb.width / 2), Math.round(sb.y + sb.height / 2), 700);
            await page.evaluate(([a, b]) => window.__ring?.(a, b), [cx, cy]); }
  await submit.click();
  await page.evaluate(() => {
    const d = document.createElement("div"); d.id = "__sign";
    d.innerHTML = `<div style="color:#FF6A00;font-size:13px;letter-spacing:.18em">MONAD TESTNET</div>
      <div style="color:#fff;font-size:30px;font-weight:700">Signing Transaction</div>
      <div id="__sh" style="color:#8F8F8F;font-size:13px">broadcasting…</div>`;
    document.body.appendChild(d);
  });
  await until("broadcast", () => sent.length > before, 60000);
  const txHash = sent[sent.length - 1];
  await page.evaluate((h) => { const e = document.getElementById("__sh"); if (e) e.textContent = h; }, txHash);
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`TX_REVERTED ${txHash}`);
  console.log(`  confirmed ${txHash} in block ${receipt.blockNumber}`);
  await hold("sign", s);
  await page.evaluate(() => document.getElementById("__sign")?.remove());

  s = line("confirmed");
  await hold("confirmed", s);

  // ------------------------------------------------------- monadscan proof
  s = line("explorer-tx");
  await page.goto(`https://testnet.monadscan.com/tx/${txHash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  await hold("explorer-tx", s);

  s = line("explorer-transfer");
  await page.mouse.wheel(0, 330); await sleep(2500); await page.mouse.wheel(0, 300);
  await hold("explorer-transfer", s);

  s = line("explorer-address");
  await page.goto(`https://testnet.monadscan.com/address/${account.address}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000); await page.mouse.wheel(0, 260);
  await hold("explorer-address", s);

  s = line("explorer-contract");
  await page.goto(`https://testnet.monadscan.com/address/${AXON}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000); await page.mouse.wheel(0, 240);
  await hold("explorer-contract", s);

  // ------------------------------------------------- the run, now on record
  s = line("leaderboard");
  await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" });
  await sleep(2500); await page.mouse.wheel(0, 240);
  await hold("leaderboard", s);

  s = line("task-page");
  await page.goto(`${BASE}/task/${TASK}`, { waitUntil: "networkidle" });
  await sleep(2500); await page.mouse.wheel(0, 320);
  await hold("task-page", s);

  s = line("run-verify");
  const runHref = await page.locator("a[href^='/run/0x']").first().getAttribute("href").catch(() => null);
  await page.goto(`${BASE}${runHref ?? "/leaderboard"}`, { waitUntil: "networkidle" });
  await sleep(2500); await page.mouse.wheel(0, 300);
  await hold("run-verify", s);

  // ------------------------------- the policy, and a licence that pays it out
  s = line("foundry");
  await page.goto(`${BASE}/foundry`, { waitUntil: "networkidle" });
  await until("policies", async () => (await page.locator("body").innerText()).includes("CAP TABLE"), 25000);
  await sleep(2000);
  // Prefer the policy with the widest cap table — the fan-out is the point.
  const wide = page.locator("article").filter({ hasText: /CAP TABLE — [2-9]\d* CONTRIBUTOR/ }).first();
  const target = (await wide.count()) ? wide : page.locator("article").first();
  await target.scrollIntoViewIfNeeded();
  await sleep(2500);
  await hold("foundry", s);

  s = line("licence-sign");
  const before2 = sent.length;
  const buy = target.locator("button", { hasText: /Licence for/i }).first();
  await buy.waitFor({ state: "visible", timeout: 20000 });
  const bb = await buy.boundingBox();
  if (bb) { await glide(Math.round(bb.x + bb.width / 2), Math.round(bb.y + bb.height / 2), 700);
            await page.evaluate(([a, b]) => window.__ring?.(a, b), [cx, cy]); }
  await buy.click();
  await page.evaluate(() => {
    const d = document.createElement("div"); d.id = "__sign";
    d.innerHTML = `<div style="color:#FF6A00;font-size:13px;letter-spacing:.18em">MONAD TESTNET</div>
      <div style="color:#fff;font-size:30px;font-weight:700">Paying the cap table</div>
      <div id="__sh" style="color:#8F8F8F;font-size:13px">broadcasting…</div>`;
    document.body.appendChild(d);
  });
  await until("licence-broadcast", () => sent.length > before2, 60000);
  const licTx = sent[sent.length - 1];
  await page.evaluate((h) => { const e = document.getElementById("__sh"); if (e) e.textContent = h; }, licTx);
  const licReceipt = await pub.waitForTransactionReceipt({ hash: licTx });
  if (licReceipt.status !== "success") throw new Error(`LICENCE_REVERTED ${licTx}`);
  console.log(`  licence confirmed ${licTx} in block ${licReceipt.blockNumber}`);
  await hold("licence-sign", s);
  await page.evaluate(() => document.getElementById("__sign")?.remove());

  s = line("licence-paid");
  await sleep(2500);
  await hold("licence-paid", s);

  s = line("licence-explorer");
  await page.goto(`https://testnet.monadscan.com/tx/${licTx}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000); await page.mouse.wheel(0, 340); await sleep(2500); await page.mouse.wheel(0, 280);
  await hold("licence-explorer", s);

  s = line("outro");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await hold("outro", s);

  writeFileSync("demo/out/take-txs.json", JSON.stringify({ txHash, task: TASK,
    operator: account.address, block: Number(receipt.blockNumber),
    explorer: `https://testnet.monadscan.com/tx/${txHash}`,
    licenceTx: licTx, licenceBlock: Number(licReceipt.blockNumber),
    licenceExplorer: `https://testnet.monadscan.com/tx/${licTx}`, sent }, null, 2));
  console.log("\nTAKE OK");
} catch (e) {
  console.error(`\nTAKE FAILED: ${e.message}`);
  writeFileSync("demo/out/take-error.txt", String(e.stack ?? e));
  process.exitCode = 1;
} finally {
  writeFileSync("demo/out/beats.json", JSON.stringify({ marks, durations, base: BASE }, null, 2));
  writeFileSync("demo/out/beats.log", marks.map((m) => `DEMO_LINE ${m.atMs} ${m.id}${m.signing ? " SIGNING" : ""}`).join("\n"));
  const v = page.video();
  await ctx.close(); await browser.close();
  if (v) {
    const p = await v.path();
    if (existsSync(p)) {
      renameSync(p, `${OUT}/raw.webm`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${OUT}/raw.webm`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", `${OUT}/raw.mp4`]);
      const d = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${OUT}/raw.mp4`]).toString().trim();
      console.log(`raw take ${Number(d).toFixed(1)}s -> ${OUT}/raw.mp4`);
    }
  }
}
