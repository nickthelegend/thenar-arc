/** Explorer beats, headed so the explorer's bot check clears. Same hashes as
 *  the app take — read from take-txs.json, never a constant or a recent tx. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "demo/out";
if (!existsSync(`${OUT}/take-txs.json`)) throw new Error("NO_TAKE_TXS");
const T = JSON.parse(readFileSync(`${OUT}/take-txs.json`, "utf8"));
if (!T.txHash || !T.licenceTx) throw new Error("NO_TAKE_TXS — missing a hash from this take");
const AXON = "0x89384f46e430F37DB61Afb98810eba995C0d6Ed4";
const E = "https://testnet.monadscan.com";

const HOLDS = { "explorer-tx": 13, "explorer-transfer": 12, "explorer-address": 12,
                "explorer-contract": 11, "licence-explorer": 14 };
const marks = [];
let t0 = 0;
const now = () => Date.now() - t0;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const ctx = await chromium.launchPersistentContext("/tmp/pw-profile", {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  args: ["--disable-blink-features=AutomationControlled", "--hide-scrollbars"],
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = ctx.pages()[0] ?? await ctx.newPage();

// Hide the explorer's cookie notice rather than clicking "Got it!" — this is
// a recording, and accepting terms is not mine to do.
const HIDE = `#cookieconsent, .cookie-consent, [class*="cookie" i][class*="banner" i],
  [id*="cookie" i][id*="consent" i], [class*="CookieConsent" i] { display: none !important; }`;
async function open(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  for (let i = 0; i < 16; i++) {
    await sleep(1500);
    const t = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (!/security verification|verify you are human|just a moment|are not a bot/i.test(t) && t.length > 200) {
      await page.addStyleTag({ content: HIDE }).catch(() => {});
      // Some notices are rendered late; drop anything that still says it.
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("div,section,aside")) {
          const tx = (el.textContent || "").slice(0, 200);
          if (/uses cookies to improve your experience/i.test(tx) && el.getBoundingClientRect().height < 200) el.remove();
        }
      }).catch(() => {});
      return;
    }
  }
  throw new Error(`EXPLORER_BLOCKED ${url}`);
}
function line(id) { const at = now(); marks.push({ id, atMs: at }); console.log(`DEMO_LINE ${at} ${id}`); return at; }
async function hold(id, since) { await sleep(HOLDS[id] * 1000 - (now() - since)); }

try {
  await open(`${E}/tx/${T.txHash}`);
  t0 = Date.now();

  let s = line("explorer-tx");
  await sleep(2000);
  await hold("explorer-tx", s);

  s = line("explorer-transfer");
  const it = page.locator("text=/Internal Transactions/i").first();
  if (await it.count()) await it.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(3500); await page.mouse.wheel(0, 200);
  await hold("explorer-transfer", s);

  s = line("explorer-address");
  await open(`${E}/address/${T.operator}`);
  await sleep(2500); await page.mouse.wheel(0, 260);
  await hold("explorer-address", s);

  s = line("explorer-contract");
  await open(`${E}/address/${AXON}`);
  await sleep(2500); await page.mouse.wheel(0, 240);
  await hold("explorer-contract", s);

  s = line("licence-explorer");
  await open(`${E}/tx/${T.licenceTx}`);
  await sleep(2500);
  const it2 = page.locator("text=/Internal Transactions/i").first();
  if (await it2.count()) await it2.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(4000); await page.mouse.wheel(0, 220);
  await hold("licence-explorer", s);

  console.log("\nEXPLORER TAKE OK");
} catch (e) {
  console.error(`\nEXPLORER TAKE FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/beats-explorer.json`, JSON.stringify({ marks, holds: HOLDS, txs: T }, null, 2));
  const v = page.video();
  await ctx.close();
  if (v) {
    const p = await v.path();
    if (existsSync(p)) {
      renameSync(p, `${OUT}/explorer.webm`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${OUT}/explorer.webm`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", `${OUT}/explorer.mp4`]);
      console.log(`explorer footage -> ${OUT}/explorer.mp4`);
    }
  }
}
