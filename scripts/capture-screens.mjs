/**
 * Thenar's key screens, captured from the running local stack, at 1440×900 and 390×844.
 *
 *   pnpm demo --serve        (in another terminal)
 *   CHROMIUM=… node --import ./test/register.mjs scripts/capture-screens.mjs
 *
 * Every state is real:
 * - a local wallet signs in and its passkey is made (Chromium's virtual
 *   authenticator stands in for Face ID);
 * - the SO-101 key is derived from that passkey;
 * - the arm is driven live at the station;
 * - a paid run is opened;
 * - a corpus is bought over x402 and settled on the local chain.
 * Writes docs/screens/thenar/<nn>-<screen>-{desktop,mobile}.png. Then run
 * scripts/contact-sheet.py to lay them out.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3336";
const OUT = "docs/screens/thenar";
mkdirSync(OUT, { recursive: true });
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const sql = (q) => execFileSync("sqlite3", [".data/localnet.db", q], { encoding: "utf8" }).trim();
const [runHash, runTask] = sql("select traj_hash, task_id from trajectory where settled = 1 order by created_at desc limit 1;").split("|");

const browser = await chromium.launch({ headless: false, executablePath: process.env.CHROMIUM, args: ["--window-size=1460,980"] });
const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
});
const text = () => page.evaluate(() => document.body.innerText);
const until = async (fn, ms, what) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(250);
  }
};

/** Both widths of the page as it stands, scrolled to `anchor` when given. */
async function shoot(nn, name, anchor) {
  for (const [label, size] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(900);
    if (anchor) await page.locator(anchor).first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${nn}-${name}-${label}.png` });
  }
  await page.setViewportSize(DESKTOP);
  console.log(`captured  ${nn}-${name}`);
}

try {
  // A signed-in operator with a passkey.
  await page.goto(`${BASE}/localnet`);
  await page.getByRole("button", { name: "Sign in with the local wallet" }).click();
  await until(async () => /[1-9][\d.]* MON · 20 USDC/.test(await page.getByTestId("local-balances").textContent()), 30_000, "the faucet");
  await page.goto(`${BASE}/passkey`);
  await page.getByRole("button", { name: "Set up your passkey" }).click();
  await until(async () => /Passkey set · you can earn/i.test(await text()), 60_000, "the passkey");

  // 1. The landing page.
  await page.goto(`${BASE}/thenar`);
  await page.waitForTimeout(2500);
  await shoot("01", "landing");

  // 2. The operator console, mid-drive.
  await page.goto(`${BASE}/station/0`);
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await begin.click();
  await until(async () => /end run/i.test(await text()), 10_000, "the run");
  await page.locator("canvas").first().hover();
  for (const [k, ms] of [["s", 420], ["a", 380], ["q", 350]]) {
    await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k);
  }
  await page.waitForTimeout(600);
  await shoot("02", "station-driving");

  // 3. A paid run.
  await page.goto(`${BASE}/run/${runHash}`);
  await until(async () => /Re-derived in this browser and it matches/.test(await text()), 30_000, "the run's re-hash");
  await shoot("03", "run");

  // 4. The corpus, bought over x402 from this wallet.
  await page.goto(`${BASE}/corpus?task=${runTask}`);
  const buy = page.getByRole("button", { name: /^Buy task #\d+ for/ });
  await buy.waitFor({ timeout: 30_000 });
  await until(async () => !(await buy.isDisabled()), 15_000, "the USDC balance");
  await buy.click();
  await until(async () => /Paid and saved/.test(await page.getByTestId("corpus-pull").innerText()), 60_000, "the purchase");
  await shoot("04", "corpus-purchase", "[data-testid=corpus-pull]");

  // 5. The leaderboard.
  await page.goto(`${BASE}/leaderboard`);
  await page.waitForTimeout(3500);
  await shoot("05", "leaderboard");

  // 6. One passkey, many keys.
  await page.goto(`${BASE}/passkey`);
  await page.getByRole("button", { name: /^Derive my SO-101 key$/ }).click();
  await until(async () => /Verified in this page/.test(await text()), 30_000, "the SO-101 key");
  await shoot("06", "passkey-many-keys", "[data-testid=robot-key]");

  // 7. Agents: the x402 offer and the sales agents have made.
  await page.goto(`${BASE}/agents`);
  await page.waitForTimeout(3000);
  await shoot("07", "agents");
} finally {
  await browser.close();
}
console.log("CAPTURE: DONE");
