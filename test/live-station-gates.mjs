/**
 * Live, on the local chain: what the station refuses, in a real browser.
 *
 *   BASE=http://localhost:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-station-gates.mjs
 *
 * A. Signed out, a practice run placed in tolerance: the after-run button says
 *    there is nothing to submit and is disabled, and pressing it signs nobody in.
 * B. Signed in, no passkey: the station asks for one before the run, and the
 *    submit is refused by the verifier ("Set up your passkey…"). Nothing is paid.
 * C. A wallet under the gas floor: the warning and the amount it names agree
 *    with the floor it is raised at (LOW_GAS_BALANCE, 0.1).
 *
 * Headed Chromium, because the station draws with WebGL and requestAnimationFrame.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const FAUCET = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"; // anvil #5, the local faucet
const chain = createPublicClient({ transport: http(RPC) });
const log = (k, v) => console.log(k.padEnd(10), typeof v === "string" ? v : JSON.stringify(v));

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"], executablePath: process.env.CHROMIUM });
const errors = [];
const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 860 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
};
const until = async (fn, ms, what) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

/** Drive task 0's payload into its ring with the keyboard (the journey test's route). */
async function placeIt(page) {
  const text = () => page.evaluate(() => document.body.innerText);
  await page.locator("canvas").first().hover();
  const tool = async () => {
    const m = (await text()).match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  await until(tool, 10_000, "the tool readout");
  const KEYS = [["w", "s"], ["a", "d"], ["e", "q"]];
  const SPEED = 0.42;
  const goTo = async (goal, tol = 0.004) => {
    for (let pass = 0; pass < 8; pass++) {
      const now = await tool();
      const e = goal.map((g, i) => g - now[i]);
      if (Math.hypot(...e) < tol) return now;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(e[i]) < tol / 2) continue;
        const k = KEYS[i][e[i] > 0 ? 0 : 1];
        await page.keyboard.down(k);
        await page.waitForTimeout(Math.max(16, (Math.abs(e[i]) / SPEED) * 1000 * (pass ? 0.8 : 0.95)));
        await page.keyboard.up(k);
        await page.waitForTimeout(120);
      }
    }
    return tool();
  };
  const jaws = async () => { await page.keyboard.press(" "); await page.waitForTimeout(500); };
  await goTo([0.22, 0.14, 0.12]);
  await goTo([0.22, 0.14, 0.05]);
  await jaws();
  await goTo([0.22, 0.14, 0.16]);
  await goTo([0.16, -0.18, 0.16]);
  await goTo([0.16, -0.18, 0.07]);
  await jaws();
  await goTo([0.16, -0.18, 0.18], 0.01);
  await until(async () => /IN TOLERANCE|OUT OF TOLERANCE/.test(await text()), 20_000, "the verdict");
  return (await text()).match(/(IN|OUT OF) TOLERANCE/)[1];
}

try {
  // A. Signed out, practice.
  {
    const page = await open();
    await page.goto(`${BASE}/station/0`);
    const practise = page.getByRole("button", { name: /^Practise first/ });
    await practise.waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1500);
    await practise.click();
    await until(async () => /end run/i.test(await page.evaluate(() => document.body.innerText)), 10_000, "the run");
    const v = await placeIt(page);
    log("A verdict", v);
    assert.equal(v, "IN", "the practice run was placed");
    const btn = page.getByRole("button", { name: "Practice run — nothing to submit" });
    await btn.waitFor({ timeout: 5000 });
    assert.equal(await btn.isDisabled(), true, "the practice button is disabled");
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    const connected = await page.evaluate(() => localStorage.getItem("thenar:localnet:connected"));
    log("A signin", connected === "1" ? "signed in (wrong)" : "nobody signed in");
    assert.notEqual(connected, "1", "pressing it signed nobody in");
    await page.context().close();
  }

  // B and C share a wallet: signed in, never given a passkey.
  const page = await open();
  await page.goto(`${BASE}/localnet`);
  await page.getByRole("button", { name: "Sign in with the local wallet" }).click();
  await until(async () => /Holds\s*5\.0000/.test(await page.evaluate(() => document.body.innerText)), 30_000, "the faucet");
  const key = await page.evaluate(() => localStorage.getItem("thenar:localnet:key"));
  const account = privateKeyToAccount(key);
  log("wallet", account.address);

  // B. The gate before the run, and the verifier's refusal after it.
  await page.goto(`${BASE}/station/0`);
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  const brief = await page.evaluate(() => document.body.innerText);
  assert.match(brief, /Set up your passkey/, "the station asks for a passkey before a paid run");
  log("B gate", "Set up your passkey (before the run)");
  await begin.click();
  await until(async () => /end run/i.test(await page.evaluate(() => document.body.innerText)), 10_000, "the run");
  const v = await placeIt(page);
  assert.equal(v, "IN", "the run was placed");
  const before = await chain.getBalance({ address: account.address });
  await page.getByRole("button", { name: "Submit and get paid" }).click();
  const alert = await until(async () => page.getByRole("alert").first().textContent(), 30_000, "the refusal");
  log("B refusal", alert.trim());
  assert.match(alert, /passkey/i, "the verifier refused a run from an address with no passkey");
  const after = await chain.getBalance({ address: account.address });
  assert.equal(after, before, "nothing was paid or spent");

  // C. Under the gas floor: leave 0.05 MON and read the station's warning.
  const wallet = createWalletClient({ account, transport: http(RPC) });
  const bal = await chain.getBalance({ address: account.address });
  const gasPrice = await chain.getGasPrice();
  const send = bal - parseEther("0.05") - 21_000n * gasPrice * 2n;
  const tx = await wallet.sendTransaction({ to: FAUCET, value: send, chain: null, gasPrice });
  await chain.waitForTransactionReceipt({ hash: tx });
  log("C balance", `${formatEther(await chain.getBalance({ address: account.address }))} MON`);
  await page.goto(`${BASE}/station/0`);
  await page.getByRole("button", { name: /^Begin run$/ }).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Begin run$/ }).click();
  await until(async () => /end run/i.test(await page.evaluate(() => document.body.innerText)), 10_000, "the run");
  await placeIt(page);
  const panel = await page.evaluate(() => document.body.innerText);
  const roughly = panel.match(/needs roughly ([\d.]+)/)?.[1];
  log("C warning", panel.match(/[^\n]*needs roughly[^\n]*/)?.[0] ?? "none");
  assert.equal(roughly, "0.1", "the warning names the floor it is raised at");

  log("errors", errors);
  assert.deepEqual(errors.filter((e) => !/403|Forbidden|passkey/i.test(e)), []);
  console.log("LIVE STATION GATES: PASS");
} finally {
  await browser.close();
}
