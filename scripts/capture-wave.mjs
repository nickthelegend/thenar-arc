/**
 * The development wave's before and after screens, from the running local stack.
 *
 *   pnpm demo --serve        (in another terminal)
 *   CHROMIUM=… node --import ./test/register.mjs scripts/capture-wave.mjs after landing station
 *
 * Writes docs/screens/wave/<nn>-<screen>-<phase>-{desktop,mobile}.png at
 * 1440×900 and 390×844. Each screen waits for its real state before the
 * shot: the Monad pipeline waits for live testnet blocks, the corpus for its
 * previews. One headless browser, closed at the end. Also checks each page's
 * console and fails on an error, so a screen is never captured broken.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3336";
const OUT = "docs/screens/wave";
mkdirSync(OUT, { recursive: true });
const [phase = "after", ...only] = process.argv.slice(2);
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const sql = (q) => execFileSync("sqlite3", [".data/localnet.db", q], { encoding: "utf8" }).trim();
const [runHash, runTask] = sql("select traj_hash, task_id from trajectory where settled = 1 order by created_at desc limit 1;").split("|");

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); });

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(250);
  }
}

/** The Monad pipeline is live and has measured a block from Proposed to Finalized. */
const pipelineLive = (sel = "[data-testid=monad-pipeline]") =>
  until(async () => {
    const el = page.locator(sel);
    if ((await el.getAttribute("data-connection")) !== "live") return false;
    return /\d+ ms/.test((await page.locator("[data-key=final]").first().textContent()) ?? "");
  }, 20_000, "live Monad blocks");

const SCREENS = {
  landing: { nn: "01", path: "/thenar", anchor: "[data-testid=monad-pipeline]", ready: () => pipelineLive() },
  station: {
    nn: "03", path: "/station/0", anchor: "[data-testid=monad-heartbeat]",
    ready: () => until(async () => (await page.locator("[data-testid=monad-heartbeat]").getAttribute("data-connection")) === "live"
      && /\d+ ms/.test(await page.locator("[data-testid=monad-heartbeat]").textContent()), 20_000, "the heartbeat"),
  },
  run: { nn: "04", path: `/run/${runHash}` },
  corpus: {
    nn: "05", path: "/corpus", anchor: "[data-testid=episode-grid]", top: true,
    ready: () => until(async () => (await page.locator("[data-testid=episode-card] svg[role=img]").count()) >= 2, 20_000, "the episode previews"),
  },
  "corpus-task": {
    nn: "05b", path: `/corpus?task=${runTask}`,
    ready: () => until(async () => /matches|commit|differs|no manifest/.test((await page.getByTestId("corpus-root-status").textContent()) ?? "")
      && (await page.locator("[data-testid=episode-card] svg[role=img]").count()) >= 1, 20_000, "the task summary"),
  },
  agents: {
    nn: "06", path: "/agents", anchor: "[data-testid=decision-trails]", top: true,
    ready: () => until(async () => (await page.locator("[data-testid=decision-trail][data-check=valid]").count()) >= 1, 20_000, "a checked decision trail"),
  },
  passkey: { nn: "07", path: "/passkey" },
  network: {
    nn: "10", path: "/network",
    ready: () => until(async () => /valid \(the precompile returned 1\)/.test(await page.getByTestId("network-p256").textContent())
      && /validator \d+/.test(await page.getByTestId("network-staking").textContent())
      && /bytes/.test(await page.getByTestId("network-canonical").textContent()), 30_000, "the live Monad reads"),
  },
  start: { nn: "11", path: "/start", ready: () => until(async () => (await page.locator("[data-step]").count()) === 5, 15_000, "the steps") },
  status: { nn: "08", path: "/status" },
};

try {
  for (const [name, s] of Object.entries(SCREENS)) {
    if (only.length && !only.includes(name)) continue;
    for (const [label, size] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
      await page.setViewportSize(size);
      await page.goto(BASE + s.path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      if (s.ready) await s.ready();
      if (s.anchor) {
        await page.locator(s.anchor).first().evaluate((el, top) => {
          el.scrollIntoView({ block: top ? "start" : "center" });
          if (top) window.scrollBy(0, -120); // clear of the floating nav
        }, Boolean(s.top));
      }
      // The landing reveals sections as they scroll in (a blur and fade of about a second); let it finish.
      await page.waitForTimeout(s.anchor ? 2400 : 600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) throw new Error(`${name} overflows ${label} by ${overflow}px`);
      await page.screenshot({ path: `${OUT}/${s.nn}-${name}-${phase}-${label}.png` });
    }
    console.log(`captured  ${s.nn}-${name}-${phase}`);
  }
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
} finally {
  await browser.close();
}
console.log("CAPTURE: DONE");
