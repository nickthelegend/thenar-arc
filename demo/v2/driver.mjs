/**
 * One raw take of Thenar for the ETHOnline demo.
 *
 * Real Playwright input events, real network calls, real testnet transactions,
 * each confirmed on its chain before the take moves on. The cursor is an SVG
 * drawn in the page and eased with requestAnimationFrame; the hardware cursor
 * is never driven. Every beat is logged as `DEMO_LINE <ms> <id>` against the
 * same clock the video starts on, and held for its measured narration.
 *
 *   DEMO_W=1440 DEMO_H=810 node demo/v2/driver.mjs
 */
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";

const W = Number(process.env.DEMO_W ?? 1920);
const H = Number(process.env.DEMO_H ?? 1080);
const BASE = process.env.BASE ?? "http://localhost:3222";
const DIR = "demo/v2";
const TAKE = `${DIR}/take`;
const ARC_RPC = "https://rpc.testnet.arc.network";
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const AGENT = "0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA";
const LAB = "0x7b4d4a773fCA1E20D2361411B34655210E44E51a";

// Real Google Chrome, headless: a visible window gets occluded by whatever is
// in front of it, and Chrome stops painting an occluded window — the first
// full-HD take captured 51 frames in three minutes that way.
const CHROME_ARGS = [
  `--window-size=${W},${H}`,
  "--autoplay-policy=no-user-gesture-required",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion,Translate",
  "--disable-notifications",
  "--hide-scrollbars",
];

rmSync(TAKE, { recursive: true, force: true });
mkdirSync(TAKE, { recursive: true });
const durations = JSON.parse(readFileSync(`${DIR}/audio/durations.json`, "utf8"));
const LOG = `${TAKE}/beats.log`;
writeFileSync(LOG, "");
const take = { base: BASE, viewport: [W, H], startedAt: new Date().toISOString(), marks: [], txs: {}, notes: {}, appErrors: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let T0 = Date.now();
const now = () => Date.now() - T0;
function mark(label) {
  const ms = now();
  appendFileSync(LOG, `DEMO_LINE ${ms} ${label}\n`);
  take.marks.push({ id: label, ms });
  console.log(`DEMO_LINE ${ms} ${label}`);
  return ms;
}
const started = {};
function line(id) {
  if (!(id in durations)) throw new Error(`NO_AUDIO_DURATION:${id}`);
  started[id] = Date.now();
  mark(id);
}
async function hold(id) {
  const wait = started[id] + durations[id] * 1000 + 450 - Date.now();
  if (wait > 0) await sleep(wait);
}
async function until(label, predicate, timeoutMs = 30000, every = 250) {
  const t = Date.now();
  for (;;) {
    let v = null;
    try { v = await predicate(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t > timeoutMs) throw new Error(`UNTIL_TIMEOUT:${label}`);
    await sleep(every);
  }
}
async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd(), env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("close", (code) => resolve({ code, out }));
  });
}

// ---- pre-flight: funds for every transaction this take will make ----------
{
  const lab = Number(BigInt(await rpc(ARC_RPC, "eth_getBalance", [LAB, "latest"]))) / 1e18;
  const hbar = async (id) => ((await (await fetch(`${MIRROR}/balances?account.id=${id}`)).json()).balances?.[0]?.balance ?? 0) / 1e8;
  const agentHbar = await hbar("0.0.10518775");
  const issuerHbar = await hbar("0.0.9842030");
  take.notes.preflight = { labUsdc: lab, agentHbar, issuerHbar };
  console.log("preflight", take.notes.preflight);
  if (lab < 0.02) throw new Error("PREFLIGHT_LAB_UNDERFUNDED");
  if (agentHbar < 1.5) throw new Error("PREFLIGHT_AGENT_UNDERFUNDED");
  if (issuerHbar < 5) throw new Error("PREFLIGHT_ISSUER_UNDERFUNDED");
}

// ---- pre-flight: the recorder records real content -------------------------
{
  const b = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_ARGS });
  const c = await b.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  await p.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  const s = await c.newCDPSession(p);
  const frame = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("PREFLIGHT_NO_SCREENCAST_FRAME")), 15000);
    s.on("Page.screencastFrame", (f) => { clearTimeout(t); s.send("Page.screencastAck", { sessionId: f.sessionId }).catch(() => {}); resolve(f); });
    s.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H }).catch(reject);
  });
  writeFileSync(`${TAKE}/preflight.jpg`, Buffer.from(frame.data, "base64"));
  await c.close();
  await b.close();
  const stat = execFileSync("python3", ["-c", `from PIL import Image, ImageStat; im=Image.open("${TAKE}/preflight.jpg"); s=ImageStat.Stat(im.convert("L")); print(s.mean[0], s.stddev[0], im.size[0], im.size[1])`]).toString().trim().split(" ").map(Number);
  if (stat[2] !== W || stat[3] !== H) throw new Error(`PREFLIGHT_WRONG_SIZE ${stat[2]}x${stat[3]}`);
  console.log("preflight frame mean/stddev", stat);
  if (!(stat[1] > 12)) throw new Error("PREFLIGHT_RECORDER_BLANK");
}

const INIT = `(() => {
  if (window.__demo) return;
  const root = () => document.documentElement;
  const ensure = (x, y) => {
    let d = document.getElementById("__demo_cursor");
    if (!d) {
      d = document.createElement("div");
      d.id = "__demo_cursor";
      d.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.6 18.6 L14.3 26.8 L18.1 25.2 L14.5 17.2 L22.3 17.2 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
      Object.assign(d.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))", willChange: "transform" });
      root().appendChild(d);
    }
    d.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)";
  };
  const glide = (x0, y0, x1, y1, ms) => new Promise((res) => {
    ensure(x0, y0);
    const el = document.getElementById("__demo_cursor");
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (n) => {
      const t = Math.min(1, (n - t0) / ms), e = ease(t);
      el.style.transform = "translate(" + (x0 + (x1 - x0) * e - 5) + "px," + (y0 + (y1 - y0) * e - 3) + "px)";
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  const ring = (x, y) => {
    const r = document.createElement("div");
    Object.assign(r.style, { position: "fixed", left: (x - 20) + "px", top: (y - 20) + "px", width: "40px", height: "40px", borderRadius: "50%", border: "3px solid #2B50E0", zIndex: "2147483646", pointerEvents: "none", transform: "scale(.35)", opacity: "1", transition: "transform 480ms cubic-bezier(.16,1,.3,1), opacity 480ms ease-out" });
    root().appendChild(r);
    requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.7)"; r.style.opacity = "0"; }));
    setTimeout(() => r.remove(), 700);
  };
  const overlay = (title, sub) => {
    let o = document.getElementById("__demo_overlay");
    if (!o) { o = document.createElement("div"); o.id = "__demo_overlay"; root().appendChild(o); }
    Object.assign(o.style, { position: "fixed", inset: "0", zIndex: "2147483645", background: "#1F3FD1", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif" });
    o.innerHTML = '<div style="font-size:52px;font-weight:650;letter-spacing:-0.02em">' + title + '</div><div style="margin-top:16px;font:500 20px/1.4 ui-monospace,Menlo,monospace;opacity:.9">' + (sub || "") + '</div>';
  };
  const clearOverlay = () => document.getElementById("__demo_overlay")?.remove();
  const scrollBy = (dy, ms) => new Promise((res) => {
    const y0 = window.scrollY, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (n) => { const t = Math.min(1, (n - t0) / ms); window.scrollTo(0, y0 + dy * ease(t)); if (t < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
  // Frame pump: a 2px element whose opacity changes every frame, so the
  // compositor draws — and the screencast delivers — frames at a steady rate
  // even while the page itself is still.
  const pump = () => {
    let p = document.getElementById("__demo_pump");
    if (!p && document.documentElement) {
      p = document.createElement("div");
      p.id = "__demo_pump";
      Object.assign(p.style, { position: "fixed", right: "0", bottom: "0", width: "2px", height: "2px", zIndex: "2147483647", pointerEvents: "none", background: "#000", opacity: "0.01" });
      document.documentElement.appendChild(p);
    }
    if (p) p.style.opacity = p.style.opacity === "0.01" ? "0.02" : "0.01";
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  window.__demo = { ensure, glide, ring, overlay, clearOverlay, scrollBy };
})();`;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light", locale: "en-US" });
await context.addInitScript(INIT);
const page = await context.newPage();
T0 = Date.now();

// Capture: a loop of real Chrome screenshots at full viewport resolution,
// JPEG quality 88, each stamped on the same wall clock as the marks. Chrome's
// screencast stalled here at 0.3 fps; captureScreenshot forces a fresh frame
// each time and holds ~30 fps at 1920x1080, even on the 3D station.
const FRAMES = `${TAKE}/frames`;
mkdirSync(FRAMES, { recursive: true });
const frames = [];
const pendingWrites = new Set();
let cdp = null;
let capturing = true;
async function startCast() {
  if (!cdp) cdp = await context.newCDPSession(page);
}
// A session that saw a navigation can hang on its next capture forever, so
// every capture is raced against a timeout and a session is dropped the moment
// it fails, times out, or the page navigates.
function resetCast() {
  const old = cdp;
  cdp = null;
  old?.detach().catch(() => {});
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("CAPTURE_TIMEOUT")), ms))]);
async function captureLoop() {
  while (capturing) {
    const t = Date.now();
    try {
      await startCast();
      const { data } = await withTimeout(cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88, optimizeForSpeed: true }), 1200);
      const name = `f${String(frames.length).padStart(6, "0")}.jpg`;
      frames.push({ name, ms: t - T0 });
      const w = writeFile(`${FRAMES}/${name}`, Buffer.from(data, "base64")).finally(() => pendingWrites.delete(w));
      pendingWrites.add(w);
    } catch {
      resetCast();
      await sleep(30);
    }
  }
}
await startCast();
const captureDone = captureLoop();
page.on("dialog", (d) => d.accept().catch(() => {}));
page.on("console", (m) => { if (m.type() === "error" && page.url().startsWith(BASE)) take.appErrors.push({ ms: now(), url: page.url(), text: m.text().slice(0, 200) }); });
page.on("pageerror", (e) => { if (page.url().startsWith(BASE)) take.appErrors.push({ ms: now(), url: page.url(), text: String(e).slice(0, 200) }); });

let cur = { x: W / 2, y: H / 2 };
const ensureCursor = () => page.evaluate(([x, y]) => window.__demo.ensure(x, y), [cur.x, cur.y]).catch(() => {});
async function glide(x, y, ms = 700) {
  await ensureCursor();
  await page.evaluate(([x0, y0, x1, y1, d]) => window.__demo.glide(x0, y0, x1, y1, d), [cur.x, cur.y, x, y, ms]);
  cur = { x, y };
  await page.mouse.move(x, y);
}
async function center(locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 15000 });
  await sleep(300);
  const b = await locator.boundingBox();
  if (!b) throw new Error("NO_BOUNDING_BOX");
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function clickAt(x, y) {
  await glide(x, y, 650);
  await page.evaluate(([a, b]) => window.__demo.ring(a, b), [x, y]);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
const clickEl = async (loc) => { const [x, y] = await center(loc); await clickAt(x, y); };
const hoverEl = async (loc, ms = 750) => { const [x, y] = await center(loc); await glide(x, y, ms); };
async function typeInto(loc, text) {
  await clickEl(loc);
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(1000 / 24 + (Math.random() - 0.5) * 24);
  }
}
const smoothScroll = async (dy, ms = 900) => { await page.evaluate(([a, b]) => window.__demo.scrollBy(a, b), [dy, ms]); await sleep(ms + 120); };
const text = () => page.evaluate(() => document.body.innerText);
const has = (s) => async () => (await text()).toLowerCase().includes(s.toLowerCase());
async function go(url, label, ready, timeout = 45000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  resetCast();
  await until(label, ready, timeout);
  await ensureCursor();
  // HashScan opens with a cookie-consent dialog over the page; decline
  // non-essential cookies with a real click so the explorer beat shows the
  // transaction, not the dialog.
  if (!url.includes("hashscan.io")) return;
  const reject = page.locator("button:visible", { hasText: /^\s*reject\s*$/i }).first();
  const seen = await until("cookie dialog check", async () => (await reject.count()) > 0, 5000, 250).catch(() => false);
  if (seen === true) {
    await clickEl(reject);
    await until("cookie dialog gone", async () => (await reject.count()) === 0, 8000);
    await sleep(400);
  }
}
const visibleButton = (re) => page.locator("button:visible", { hasText: re }).first();

let failed = null;
try {
  // Sync flash: the editor locks this log's clock to the video's with it.
  await page.setContent('<html><body style="margin:0;background:#000;height:100vh"></body></html>');
  await sleep(800);
  await page.evaluate(() => { document.body.style.background = "#fff"; });
  mark("SYNC_FLASH_ON");
  await sleep(400);
  await page.evaluate(() => { document.body.style.background = "#000"; });
  await sleep(300);

  // The World ID gate, asked for real during this take: a fresh operator with
  // no Selfie Check submits a scored run to /api/verify.
  const worldGate = run("node", ["scripts/arc-run.mjs", BASE, "1"]).then(({ code, out }) => {
    const m = out.match(/refused\s+(\d+):\s*(.+)/);
    take.txs.worldGate = { at: new Date().toISOString(), exit: code, status: m ? Number(m[1]) : null, message: m ? m[2].trim() : null, operator: (out.match(/operator\s+(0x[0-9a-fA-F]{40})/) || [])[1] ?? null };
  });

  // b01 — landing
  await go(`${BASE}/`, "landing arm video playing", () => page.evaluate(() => { const v = document.querySelector(".subject-motion"); return !!v && !v.paused && v.readyState >= 3; }), 45000);
  line("b01-landing");
  await glide(W * 0.2, H * 0.32, 900);
  await hoverEl(page.getByRole("heading", { level: 1 }).first(), 800);
  await glide(W * 0.74, H * 0.74, 1300);
  await hold("b01-landing");

  // b02 — hub
  await go(`${BASE}/hub`, "hub tasks listed", async () => (await page.locator('main a[href^="/station/"]').count()) > 2);
  line("b02-hub");
  await hoverEl(page.getByText("Escrow at stake").first());
  await hoverEl(page.locator('main a[href^="/station/"]').first());
  await hold("b02-hub");

  // b03 — station, policy drives a practice run
  await go(`${BASE}/station/1`, "station ready", async () => (await visibleButton(/Let the policy drive/).count()) > 0 && (await page.locator("canvas").count()) > 0, 60000);
  line("b03-station");
  await clickEl(visibleButton(/Let the policy drive/));
  await until("practice run offered", async () => (await visibleButton(/Begin practice run/).count()) > 0, 20000);
  await clickEl(visibleButton(/Begin practice run/));
  await until("run started", async () => (await visibleButton(/^End run$/).count()) > 0, 20000);
  await glide(W * 0.52, H * 0.42, 1400);
  await hold("b03-station");
  await sleep(5000);

  // b04 — verdict
  line("b04-verdict");
  await clickEl(visibleButton(/^End run$/));
  await until("verdict measured", has("Measurement taken"), 20000);
  await glide(W * 0.5, H * 0.35, 900);
  await hold("b04-verdict");

  // b05 — lab
  await go(`${BASE}/lab`, "lab wallet loaded", has("Privy, as server wallet"), 60000);
  line("b05-lab");
  await hoverEl(page.getByText("eth_sendTransaction").first());
  await hold("b05-lab");

  // b06 — bounty signed by Privy, confirmed on Arc (signing beat)
  const inputs = page.locator("main input");
  await typeInto(inputs.nth(1), "1");
  await typeInto(inputs.nth(2), "0.01");
  await until("escrow reads 0.01 USDC", async () => (await page.locator("button", { hasText: /^Escrow 0\.01 USDC$/ }).count()) > 0, 5000);
  line("b06-lab-sign");
  await clickEl(page.locator("button", { hasText: /^Escrow 0\.01 USDC$/ }).first());
  await page.evaluate(() => window.__demo.overlay("Signing Transaction", "Privy signs under the lab policy · Arc Testnet confirms"));
  mark("b06-lab-sign:signing");
  const bountyHref = await until("bounty result with its transaction", () => page.evaluate(() => {
    const p = [...document.querySelectorAll("main *")].find((e) => e.children.length < 8 && /Signed by Privy, settled on Arc Testnet/.test(e.textContent || ""));
    return p?.querySelector('a[href*="/tx/0x"]')?.href ?? null;
  }), 120000);
  const bountyHash = bountyHref.match(/0x[0-9a-fA-F]{64}/)[0];
  const receipt = await until("Arc receipt status 1", async () => { const r = await rpc(ARC_RPC, "eth_getTransactionReceipt", [bountyHash]); return r && r.status === "0x1" ? r : null; }, 120000, 1000);
  const taskNo = await page.evaluate(() => Number((document.querySelector("main").innerText.match(/Task #(\d+) holds/) || [])[1]));
  take.txs.arcBounty = { hash: bountyHash, task: taskNo, block: parseInt(receipt.blockNumber, 16), from: receipt.from, to: receipt.to, status: receipt.status, explorer: `https://testnet.arcscan.app/tx/${bountyHash}` };
  mark("b06-lab-sign:confirmed");
  await page.evaluate(() => window.__demo.clearOverlay());
  await hoverEl(page.locator("main a", { hasText: bountyHash.slice(0, 8) }).first()).catch(() => {});
  await hold("b06-lab-sign");

  // b07 — Arcscan
  await go(take.txs.arcBounty.explorer, "Arcscan shows the transaction", async () => { const t = await text(); return t.includes(bountyHash.slice(0, 12)) && /success/i.test(t); }, 60000);
  line("b07-arcscan");
  await hoverEl(page.getByText(/^Success$/).first()).catch(() => {});
  await glide(W * 0.45, H * 0.6, 1000);
  await smoothScroll(220, 900);
  await hold("b07-arcscan");

  // b08 — Privy refuses a transfer elsewhere
  await go(`${BASE}/lab`, "lab reloaded", has("Try to spend it on something else"), 60000);
  const sendBtn = page.locator("button", { hasText: /^Send 0\.01 USDC$/ }).first();
  await hoverEl(sendBtn);
  line("b08-lab-refuse");
  await clickEl(sendBtn);
  await until("Privy refusal", has("Refused by Privy's policy engine"), 60000);
  take.notes.privyRefusal = ((await text()).match(/Refused by Privy's policy engine[^\n]*/) || [])[0] ?? null;
  await hoverEl(page.getByText("Refused by Privy's policy engine").first()).catch(() => {});
  await hold("b08-lab-refuse");

  // b09 — agents: the 402 terms with Hedera ids
  await go(`${BASE}/agents`, "agents terms loaded", has("0.0.10518776"), 60000);
  line("b09-agents");
  await hoverEl(page.getByText("0.5 HBAR per task corpus").first()).catch(() => {});
  await hoverEl(page.locator("a", { hasText: "0.0.10518776" }).first());
  await hoverEl(page.locator("a", { hasText: "0.0.10519262" }).first());
  await hold("b09-agents");

  // b10 — AgentBook lookup
  line("b10-agentbook");
  await typeInto(page.getByLabel("Agent wallet address"), AGENT);
  await clickEl(page.getByRole("button", { name: "Look it up" }));
  await until("AgentBook answer", has("Not in AgentBook"), 45000);
  await hoverEl(page.getByText("Not in AgentBook").first()).catch(() => {});
  await hold("b10-agentbook");

  // b11 — x402 on Hedera (signing beat)
  const rowsBefore = await page.locator("main table tbody tr").count();
  line("b11-x402-sign");
  await page.evaluate(() => window.__demo.overlay("Signing Transaction", "The agent pays 0.5 HBAR on Hedera · Blocky402 settles"));
  mark("b11-x402-sign:signing");
  const buy = await run("node", ["scripts/agent-buy.mjs", BASE, "1"]);
  const settled = buy.out.match(/settled\s+true\s+tx\s+(\S+)\s+payer\s+(\S+)/);
  if (!settled) throw new Error(`X402_NOT_SETTLED: ${buy.out.slice(-500)}`);
  const dashed = settled[1].replace("@", "-").replace(/\.(\d+)$/, "-$1");
  const audit = buy.out.match(/audit\s+topic\s+(\S+)\s+#(\d+)/);
  const x402 = await until("mirror node SUCCESS for the x402 transfer", async () => {
    const r = await fetch(`${MIRROR}/transactions/${dashed}`);
    const t = r.ok ? (await r.json()).transactions?.[0] : null;
    return t && t.result === "SUCCESS" ? t : null;
  }, 120000, 2000);
  take.txs.hederaX402 = { id: settled[1], mirrorId: dashed, payer: settled[2], result: x402.result, consensus: x402.consensus_timestamp, topic: audit?.[1] ?? null, sequence: audit ? Number(audit[2]) : null, sha256: (buy.out.match(/sha256\s+([0-9a-f]{64})/) || [])[1] ?? null, explorer: `https://hashscan.io/testnet/transaction/${dashed}` };
  mark("b11-x402-sign:confirmed");
  await page.reload({ waitUntil: "domcontentloaded" });
  resetCast();
  await until("new sale row on /agents", async () => (await page.locator("main table tbody tr").count()) > rowsBefore, 45000);
  await ensureCursor();
  await hoverEl(page.locator("main table tbody tr").first());
  await hold("b11-x402-sign");

  // b12 — HashScan: the settlement
  await go(take.txs.hederaX402.explorer, "HashScan shows SUCCESS", has("SUCCESS"), 90000);
  line("b12-hashscan-x402");
  await hoverEl(page.getByText("0.0.10518775").first()).catch(() => {});
  await hoverEl(page.getByText("0.0.10518776").first()).catch(() => {});
  await smoothScroll(300, 1000);
  await hold("b12-hashscan-x402");

  // b13 — HashScan: the sales topic
  await go("https://hashscan.io/testnet/topic/0.0.10519262", "HashScan topic page", has("0.0.10519262"), 90000);
  await sleep(1500);
  line("b13-hashscan-topic");
  await smoothScroll(380, 1200);
  await hold("b13-hashscan-topic");

  // b14 — the ATS security on Thenar
  const supplyOf = () => page.evaluate(() => Number((document.querySelector("main")?.innerText.match(/SHARES ISSUED\s*\n?\s*(\d+)/i) || [])[1]));
  await go(`${BASE}/corpus-token`, "security loaded", async () => (await supplyOf()) > 0, 90000);
  const supplyBefore = await supplyOf();
  line("b14-corpus-token");
  await hoverEl(page.getByText("Thenar Robot Corpus").first());
  await hoverEl(page.locator("a", { hasText: "0.0.10520394" }).first()).catch(() => {});
  await hold("b14-corpus-token");

  // b15 — ATS issuance on Hedera (signing beat)
  line("b15-ats-sign");
  await page.evaluate(() => window.__demo.overlay("Signing Transaction", "The issuer issues 10 shares · Hedera confirms"));
  mark("b15-ats-sign:signing");
  const ats = await run("node", ["scripts/ats-lifecycle.mjs", "reserve", "10"]);
  const atsHash = (ats.out.match(/issueByPartition ✓\s+\S+\/transaction\/(0x[0-9a-fA-F]{64})/) || [])[1];
  if (!atsHash) throw new Error(`ATS_NOT_CONFIRMED: ${ats.out.slice(-500)}`);
  const atsMirror = await until("mirror node SUCCESS for the issuance", async () => {
    const r = await fetch(`${MIRROR}/contracts/results/${atsHash}`);
    const j = r.ok ? await r.json() : null;
    return j && j.result === "SUCCESS" ? j : null;
  }, 150000, 2000);
  take.txs.hederaAts = { hash: atsHash, result: atsMirror.result, contractId: atsMirror.contract_id ?? null, from: atsMirror.from, timestamp: atsMirror.timestamp, explorer: `https://hashscan.io/testnet/transaction/${atsHash}`, supplyBefore };
  mark("b15-ats-sign:confirmed");
  await page.reload({ waitUntil: "domcontentloaded" });
  resetCast();
  await until("supply up by ten", async () => (await supplyOf()) === supplyBefore + 10, 90000, 1500);
  take.txs.hederaAts.supplyAfter = supplyBefore + 10;
  await ensureCursor();
  await hoverEl(page.getByText(String(supplyBefore + 10), { exact: true }).first()).catch(() => {});
  await hold("b15-ats-sign");

  // b16 — HashScan: the issuance
  await go(take.txs.hederaAts.explorer, "HashScan shows the issuance", has("SUCCESS"), 120000);
  line("b16-hashscan-ats");
  await smoothScroll(260, 1000);
  await hold("b16-hashscan-ats");

  // b17 — compliance: the agent wallet is refused a share
  await go(`${BASE}/corpus-token`, "security loaded again", async () => (await supplyOf()) > 0, 90000);
  line("b17-lookup");
  await typeInto(page.getByLabel("Holder address"), AGENT);
  await page.keyboard.press("Enter");
  await until("AccountIsBlocked", has("AccountIsBlocked"), 60000);
  await hoverEl(page.getByText(/AccountIsBlocked/).first()).catch(() => {});
  await hold("b17-lookup");

  // b18 — contracts
  await go(`${BASE}/contracts`, "contracts listed", has("AxonProtocolV2"), 60000);
  line("b18-contracts");
  await smoothScroll(520, 1700);
  await smoothScroll(520, 1700);
  await hold("b18-contracts");

  // b19 — status
  await go(`${BASE}/status`, "status 7 of 7", async () => /7\s*\/\s*7/.test(await text()), 90000);
  line("b19-status");
  await hoverEl(page.getByText(/operational/i).first()).catch(() => {});
  await smoothScroll(320, 1100);
  await hold("b19-status");
  mark("END");

  await worldGate;
} catch (e) {
  failed = String(e?.message ?? e);
  mark(`DEMO_FAIL ${failed.split("\n")[0].slice(0, 160)}`);
}

capturing = false;
await captureDone;
await Promise.all([...pendingWrites]);
writeFileSync(`${TAKE}/frames.json`, JSON.stringify(frames));
take.frames = frames.length;
await context.close();
await browser.close();
take.finishedAt = new Date().toISOString();
take.failed = failed;
writeFileSync(`${TAKE}/take.json`, JSON.stringify(take, null, 2));
console.log(failed ? `TAKE FAILED: ${failed}` : "TAKE OK");
console.log(JSON.stringify(take.txs, null, 2));
process.exit(failed ? 1 : 0);
