/**
 * Live, on the local chain: an operator's whole first day, in a real browser.
 *
 *   BASE=http://127.0.0.1:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-localnet.mjs
 *
 * Needs the local chain (scripts/localnet.mjs) and the local build
 * (scripts/localnet-app.mjs). Headed Chromium, because the station is WebGL
 * and requestAnimationFrame; Chromium's virtual authenticator (resident keys,
 * user verification, PRF) stands in for Face ID.
 *
 *  1. Sign in with the local wallet; the local faucet sends it MON and USDC.
 *  2. /passkey: Mera makes a passkey, the wallet registers its P-256 key in
 *     PasskeyRegistry, the passkey signs the server's challenge, the registry
 *     checks it through the P-256 precompile, and the issuer admits the
 *     address to CorpusShares.
 *  3. "Prove it": the registry verifies a fresh assertion, as a read.
 *  4. The station: begin a run on task 0, drive the SO-101 with the keyboard
 *     to the payload, close the jaws, carry it to the goal, let go. The page
 *     measures it; "Submit and get paid" has the verifier score and sign it,
 *     and the wallet sends submitTrajectory, which pays the operator.
 *  5. The run's page replays it, and the chain has the TrajectoryAccepted
 *     event, the payment and the corpus shares.
 *  6. /passkey derives the SO-101 key from the passkey's PRF, signs a command
 *     and verifies it in the page; Node verifies the same signature as the arm
 *     relay does; with nothing stored in the browser, the passkey gives the
 *     same key again.
 *  7. /corpus buys the task's corpus over x402 from the operator's own wallet:
 *     USDC moves, the file downloads, and SalesLog holds its SHA-256.
 *  8. /leaderboard shows the run and the sale as the Envio indexer has them
 *     (needs indexer/ running).
 *
 * SPONSORED=1 runs the same day for an operator who never holds MON: the
 * local wallet delegates to SponsoredAccount under EIP-7702 and a sponsor
 * pays every transaction's gas, the local stand-in for Privy's sponsorship on
 * Monad. The faucet sends USDC only. The checks are:
 * - the passkey registration and the submit are both sent by the sponsor, to
 *   the operator's own address;
 * - the protocol still pays the operator;
 * - the operator's MON is exactly what the run paid it.
 *
 * Every transaction is real and signed, on chain 31337. Nothing is mocked.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createPublicClient, erc20Abi, formatEther, http, parseAbi, parseAbiItem } from "viem";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, createPublicKey, verify as verifySig } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";
import { So101Chain, solveSo101, SO101 } from "../lib/so101.ts";

// localhost, not 127.0.0.1: WebAuthn refuses an IP address as a passkey's site.
const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const TASK = Number(process.env.TASK ?? 0);
const SHOTS = process.env.SHOTS;
/** "keyboard" drives the arm from the keys; "leader" from a physical-leader stand-in through the relay. */
const DRIVE = process.env.DRIVE ?? "keyboard";
const SPONSORED = process.env.SPONSORED === "1";
const RELAY_PORT = process.env.RELAY_PORT ?? "8797";
const C = LOCAL_DEPLOYMENT.contracts;
const chain = createPublicClient({ transport: http(RPC) });
const log = (k, v) => console.log(k.padEnd(10), typeof v === "string" ? v : JSON.stringify(v));
const until = async (fn, ms = 30_000, what = "condition") => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}`);
};

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,1000"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1480, height: 900 } });
const errors = [], failed = [];
// x402's offer is a 402 by design: the browser logs it, and the paid retry follows.
const offer = (s) => /\/api\/agent\/corpus/.test(s) && /402/.test(s);
page.on("console", (m) => m.type() === "error" && !(offer(`${m.location()?.url} ${m.text()}`)) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// A prefetch the next navigation cancels is aborted by design, not a failure.
page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && !offer(`${r.url()} ${r.status()}`) && failed.push(`${r.status()} ${r.request().method()} ${r.url()}`));
const cdp = await page.context().newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
});
const text = () => page.evaluate(() => document.body.innerText);
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

/** /start's steps as the page reads them: { wallet: "done", gas: "todo", … }. */
const startSteps = async () => {
  await page.goto(`${BASE}/start`);
  await page.getByTestId("start-steps").waitFor();
  await page.waitForTimeout(1500);
  return Object.fromEntries(await page.locator("[data-step]").evaluateAll((els) => els.map((e) => [e.dataset.step, e.dataset.state])));
};

try {
  // 0. A newcomer: /start has nothing done, and offers one thing to do.
  const fresh = await startSteps();
  log("start", fresh);
  assert.deepEqual(Object.values(fresh).filter((v) => v === "done"), [], "a fresh browser has no step done");
  assert.ok(await page.getByRole("button", { name: "Sign in with the local wallet" }).isVisible(), "and its one action is to sign in");

  // 1. The wallet.
  await page.goto(`${BASE}/localnet`);
  assert.ok(await page.getByTestId("localnet-banner").isVisible(), "a local build says it is not Monad");
  if (SPONSORED) {
    await page.getByRole("checkbox", { name: /A sponsor pays this wallet/ }).check();
    assert.equal(await page.evaluate(() => localStorage.getItem("thenar:localnet:sponsor")), "1");
  }
  await page.getByRole("button", { name: "Sign in with the local wallet" }).click();
  const balances = await until(async () => {
    const t = await page.getByTestId("local-balances").textContent().catch(() => null);
    return t && (SPONSORED ? /0\.0000 MON · 20 USDC/ : /[1-9][\d.]* MON/).test(t) ? t : null;
  }, 30_000, SPONSORED ? "the faucet's USDC (and no MON)" : "the faucet's MON");
  const address = (await page.locator("main a[href^='/explorer/address/0x']").nth(1).textContent()).trim();
  log("wallet", { address, balances });
  const signedIn = await startSteps();
  assert.equal(signedIn.wallet, "done", "/start sees the wallet");
  assert.equal(signedIn.gas, "done", SPONSORED ? "/start sees the sponsor" : "/start sees the MON");
  assert.notEqual(signedIn.passkey, "done", "and no passkey yet");

  // 2. The passkey, registered on chain, and admission.
  await page.goto(`${BASE}/passkey`);
  await page.getByRole("button", { name: "Set up your passkey" }).click();
  await until(async () => /Passkey set · you can earn/i.test(await text()), 60_000, "admission");
  const st = await (await fetch(`${BASE}/api/operator?address=${address}`)).json();
  assert.deepEqual([st.passkey, st.operator], [true, true], "the chain has the passkey and the address may earn");
  const key = await chain.readContract({
    address: C.passkeyRegistry, abi: parseAbi(["function hasPasskey(address) view returns (bool)"]),
    functionName: "hasPasskey", args: [address],
  });
  const whitelisted = await chain.readContract({
    address: C.corpusShares, abi: parseAbi(["function isInControlList(address) view returns (bool)"]),
    functionName: "isInControlList", args: [address],
  }).catch((e) => `unreadable: ${e.shortMessage ?? e.message}`);
  log("passkey", { registered: key, operator: st.operator, whitelisted });
  if (SPONSORED) {
    const code = await chain.getCode({ address });
    const env = readFileSync(".env.localnet", "utf8");
    const account = env.match(/NEXT_PUBLIC_LOCAL_SPONSORED_ACCOUNT=(0x[0-9a-fA-F]{40})/)[1];
    assert.equal(code?.toLowerCase(), `0xef0100${account.slice(2).toLowerCase()}`, "the wallet delegated to SponsoredAccount (EIP-7702)");
    assert.equal(await chain.getBalance({ address }), 0n, "registering the passkey cost the operator nothing");
    log("sponsored", { delegatedTo: account, mon: "0" });
  }
  await shot("localnet-passkey");

  // 3. The registry verifies a fresh assertion.
  await until(async () => (await startSteps()).passkey === "done", 20_000, "/start to read the passkey from the registry");
  await page.goto(`${BASE}/passkey`);
  await page.getByRole("button", { name: /Prove it on/ }).click();
  await until(async () => /Verified on|Rejected by the registry/.test(await text()), 30_000, "the proof");
  assert.match(await text(), /Verified on/, "PasskeyRegistry verified a fresh assertion through the P-256 precompile");

  // 4. A paid run at the station.
  let leaderPoses = null, fakeLeader = null, relay = null;
  if (DRIVE === "leader") ({ leaderPoses, fakeLeader, relay } = await startLeader());
  // The relay runs on RELAY_PORT (8787 may belong to something else on this machine); the page is told where.
  await page.goto(`${BASE}/station/${TASK}${DRIVE === "leader" ? `?relay=ws://127.0.0.1:${RELAY_PORT}` : ""}`);
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  if (DRIVE === "leader") {
    // The leader's options sit behind "Drive with: Leader".
    await page.getByRole("tab", { name: "Leader" }).click();
    await page.getByRole("button", { name: "My leader is on the arm relay" }).click();
    await until(async () => /Your leader is driving the arm/.test(await text()), 15_000, "the leader to drive the arm");
  }
  await begin.click();
  await until(async () => /end run/i.test(await text()), 10_000, "the run to begin");
  await page.locator("canvas").first().hover();

  // The tool, as the page's own readout shows it (arm frame, metres).
  const tool = async () => {
    const m = (await text()).match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  await until(tool, 10_000, "the tool readout");
  const at0 = await tool();
  let over, held = false;
  if (DRIVE === "leader") {
    // The hand on the leader does the task; the page only watches.
    fakeLeader.stdin.write("GO\n");
    const end = Date.now() + (leaderPoses.length / 50) * 1000 + 1500;
    while (Date.now() < end) {
      if (/HELD|holding/i.test(await text())) held = true;
      await page.waitForTimeout(100);
    }
    over = await tool();
  } else {
    const KEYS = [["w", "s"], ["a", "d"], ["e", "q"]];
    const SPEED = 0.42; // m/s, components/station/viewport.tsx
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
    over = await goTo([0.22, 0.14, 0.05]);
    await jaws();
    held = /HELD|holding/i.test(await text());
    await goTo([0.22, 0.14, 0.16]);
    await goTo([0.16, -0.18, 0.16]);
    await goTo([0.16, -0.18, 0.07]);
    await jaws();
    await goTo([0.16, -0.18, 0.18], 0.01);
  }
  log("drive", { by: DRIVE, start: at0, end: over, held });
  await until(async () => /IN TOLERANCE|OUT OF TOLERANCE/.test(await text()), 20_000, "the verdict");
  const verdict = (await text()).match(/(IN|OUT OF) TOLERANCE\s*([\d.]+)/);
  log("verdict", verdict?.[0]);
  await shot("localnet-verdict");
  assert.equal(verdict?.[1], "IN", "the run was placed within tolerance");
  if (SPONSORED) assert.match(await text(), /Gas on submit is paid by the sponsor/, "the station says the sponsor pays");

  const before = await chain.getBalance({ address });
  const head = await chain.getBlockNumber();
  await page.getByRole("button", { name: "Submit and get paid" }).click();
  // The panel's own confirmed state, or its alert: not a word match on the
  // station's copy, which says "paid" before anything is.
  await until(async () => {
    const alert = await page.getByRole("alert").textContent().catch(() => null);
    if (alert) throw new Error(`the submit failed: ${alert}`);
    return /Recorded and paid in one transaction/.test(await text());
  }, 90_000, "the submit to confirm");
  const shares = await until(async () => {
    const m = (await text()).match(/(.*issued on [^\n]*|No corpus shares for this run: [^\n]*)/);
    return m?.[1];
  }, 60_000, "the corpus shares line");
  log("shares", shares);
  assert.match(shares, /issued on/, "the run's corpus shares were issued");
  // Two timers, executed and final, labelled as local-chain timings, not Monad's.
  const timers = page.getByTestId("receipt-timers");
  assert.equal(await timers.getAttribute("data-where"), "local", "the receipt says its timings are the local chain's");
  const executed = await timers.locator("[data-key=executed]").textContent();
  // Anvil's finalized tag trails its head by about 63 one-second blocks, so final lands about a minute later.
  await until(async () => /\d/.test(await timers.locator("[data-key=final]").textContent()), 150_000, "the receipt's block to finalize");
  const final = await timers.locator("[data-key=final]").textContent();
  log("timers", { executed, final, note: (await timers.textContent()).match(/Local chain timings[^.]*\./)?.[0] });
  assert.match(executed, /\d+ ms|[\d.]+ s/, "an executed time was measured");
  assert.match(final, /\d+ ms|[\d.]+ s/, "a final time was measured");
  if (!SPONSORED) assert.match(await timers.textContent(), /eth_sendRawTransactionSync/, "the local wallet got its receipt from the send itself");
  await shot("localnet-paid");
  if (SHOTS) {
    const size = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await timers.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot("localnet-paid-mobile");
    await page.setViewportSize(size);
  }
  // The newcomer's checklist, now complete: every step read from the chain, the ledger or this browser.
  const allDone = await until(async () => {
    const st = await startSteps();
    return Object.values(st).every((v) => v === "done") ? st : null;
  }, 30_000, "/start to show all five steps done");
  log("start", allDone);
  await shot("localnet-start-done");
  if (SHOTS) {
    const size = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await shot("localnet-start-done-mobile");
    await page.setViewportSize(size);
  }

  // 5. What the chain says.
  const accepted = await chain.getLogs({
    address: C.axon, fromBlock: head, toBlock: "latest",
    event: parseAbiItem("event TrajectoryAccepted(uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor, bytes32 trajHash, string cid, uint16 score, uint256 paid)"),
    args: { contributor: address },
  }).catch(async () => []);
  const after = await chain.getBalance({ address });
  log("chain", {
    accepted: accepted.map((l) => ({ id: String(l.args.trajectoryId), task: String(l.args.taskId), score: l.args.score, paid: formatEther(l.args.paid), tx: l.transactionHash })),
    balanceDelta: formatEther(after - before),
  });
  assert.equal(accepted.length, 1, "one TrajectoryAccepted for this operator");
  assert.ok(accepted[0].args.paid > 0n, "the run was paid");
  if (SPONSORED) {
    const receipt = await chain.getTransactionReceipt({ hash: accepted[0].transactionHash });
    assert.equal(receipt.to.toLowerCase(), address.toLowerCase(), "the submit went to the operator's own (delegated) address");
    assert.notEqual(receipt.from.toLowerCase(), address.toLowerCase(), "and was sent by the sponsor");
    assert.equal(after - before, accepted[0].args.paid, "the operator received the whole payout and paid no gas");
    log("sponsored", { sponsor: receipt.from, gasPaidBySponsor: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), operatorGot: formatEther(after - before) });
  }

  const hash = accepted[0].args.trajHash;
  await page.goto(`${BASE}/run/${hash}`);
  await until(async () => (await text()).length > 400, 30_000, "the run page");
  const runPage = await text();
  log("run page", runPage.split("\n").filter((l) => /score|paid|MON|block|frames|samples/i.test(l)).slice(0, 8));
  await page.goto(`${BASE}/explorer/tx/${accepted[0].transactionHash}`);
  assert.match(await text(), /Success/);
  assert.match(await text(), /TrajectoryAccepted/);

  // 6. One passkey, more than one key.
  await page.goto(`${BASE}/passkey`);
  const deriveKey = async () => {
    await page.getByRole("button", { name: /^Derive (my SO-101 key|it again)$/ }).click();
    await until(async () => /Verified in this page|did not verify/.test(await text()), 30_000, "the SO-101 key");
    const box = await page.getByTestId("robot-key").innerText();
    return {
      key: box.match(/public key\s+([0-9a-f]{64})/i)[1],
      message: box.match(/(thenar-so101-cmd-v1\|[^\n]+)/)[1].trim(),
      signature: box.match(/signature ([0-9a-f]{128})/)[1],
      verified: /Verified in this page/.test(box),
    };
  };
  const k1 = await deriveKey();
  assert.equal(k1.verified, true, "the page verified its own signed command");
  // The relay's check (scripts/arm-relay.mjs): Ed25519 with the raw key in SPKI.
  const spki = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(k1.key, "hex")]), format: "der", type: "spki" });
  assert.equal(verifySig(null, Buffer.from(k1.message), spki, Buffer.from(k1.signature, "hex")), true, "the relay's check accepts the page's command");
  // A device that holds nothing: forget the stored credential, reload, derive again.
  const stored = await page.evaluate((a) => {
    const k = `thenar:passkey:v2:${a.toLowerCase()}`, v = localStorage.getItem(k);
    localStorage.removeItem(k);
    return [k, v];
  }, address);
  await page.reload();
  const k2 = await deriveKey();
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), stored);
  assert.equal(k2.key, k1.key, "the same passkey gives the same key with nothing stored");
  assert.notEqual(k2.signature, k1.signature, "a fresh command, freshly signed");
  const kept = await page.evaluate((key) => {
    const all = [...Object.values(localStorage), ...Object.values(sessionStorage), document.cookie].join("\n");
    return all.includes(key);
  }, k1.key);
  assert.equal(kept, false, "nothing about the key is stored in the browser");
  log("robot key", { key: `${k1.key.slice(0, 16)}…`, sameWithNothingStored: k2.key === k1.key, relayVerifies: true });
  await shot("localnet-robot-key");

  // 7. The corpus, bought from the page over x402.
  const usdcOf = () => chain.readContract({ address: LOCAL_DEPLOYMENT.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  const usdcBefore = await usdcOf();
  const saleHead = await chain.getBlockNumber();
  await page.goto(`${BASE}/corpus?task=${TASK}`);
  const buy = page.getByRole("button", { name: /^Buy task #\d+ for/ });
  await buy.waitFor({ timeout: 30_000 });
  await until(async () => !(await buy.isDisabled()), 15_000, "the USDC balance");
  const downloading = page.waitForEvent("download", { timeout: 60_000 });
  await buy.click();
  await until(async () => {
    const box = await page.getByTestId("corpus-pull").innerText();
    const alert = box.match(/\n([^\n]*(not accepted|answered|did not sign)[^\n]*)/);
    if (alert) throw new Error(`the purchase failed: ${alert[1]}`);
    return /Paid and saved/.test(box);
  }, 60_000, "the purchase");
  const file = readFileSync(await (await downloading).path());
  const fileSha = createHash("sha256").update(file).digest("hex");
  const usdcAfter = await usdcOf();
  const sold = await chain.getLogs({
    address: C.salesLog, fromBlock: saleHead, toBlock: "latest",
    event: parseAbiItem("event CorpusSold(uint256 indexed seq, bytes32 indexed saleId, uint256 indexed taskId, uint8 terms, address buyer, address asset, uint256 amount, bytes32 sha256)"),
  });
  const mine = sold.find((l) => l.args.buyer.toLowerCase() === address.toLowerCase());
  log("bought", { bytes: file.length, sha256: `${fileSha.slice(0, 16)}…`, usdcSpent: String(usdcBefore - usdcAfter), saleOnChain: mine ? String(mine.args.seq) : null });
  assert.equal(usdcBefore - usdcAfter, 10_000n, "one cent of USDC left the wallet");
  assert.ok(mine, "SalesLog recorded the sale to this wallet");
  assert.equal(mine.args.sha256, `0x${fileSha}`, "the file downloaded is the file the log names");
  assert.equal(Number(mine.args.taskId), TASK);
  await shot("localnet-bought");

  // 8. The indexer's history, on the leaderboard.
  const indexed = await (await fetch(`${BASE}/api/indexer`)).json();
  if (indexed.configured) {
    const caught = await until(async () => {
      const d = await (await fetch(`${BASE}/api/indexer`)).json();
      return d.stats && d.stats.runs >= 1 && d.stats.sales >= 1 && d.recent?.some((o) => o.id.toLowerCase() === address.toLowerCase()) ? d : null;
    }, 60_000, "the indexer to see the run and the sale");
    await page.goto(`${BASE}/leaderboard`);
    const panel = await until(async () => page.getByTestId("indexed-activity").innerText().catch(() => null), 30_000, "the indexer panel");
    assert.match(panel, new RegExp(`${address.slice(0, 6)}`, "i"), "the panel lists the operator who just ran");
    const today = caught.days.at(-1);
    log("indexer", { runs: caught.stats.runs, sales: caught.stats.sales, passkeys: caught.stats.passkeys, today: today && { id: today.id, runs: today.runs, sales: today.sales } });
    assert.ok(today && today.runs >= 1, "today's bar has the run");
    await shot("localnet-indexer");
  } else {
    log("indexer", "not configured on this build; skipped");
  }

  if (leaderPoses) {
    // The recording is the leader's motion: every sample's joints are a pose
    // the leader sent, to within the rounding of the wire format.
    const traj = await (await fetch(`${BASE}/api/trajectory/${hash}`)).json();
    const samples = traj.samples ?? traj.trajectory?.samples ?? [];
    const D = 180 / Math.PI;
    const worst = samples.map((smp) => Math.min(...leaderPoses.map((p) =>
      Math.max(...[0, 1, 2, 3, 4].map((j) => Math.abs(smp.q[j] * D - p[j])))))).reduce((a, b) => Math.max(a, b), 0);
    log("leader", { samples: samples.length, poses: leaderPoses.length, worstJointDegFromALeaderPose: +worst.toFixed(3) });
    assert.ok(samples.length > 50, "the run was recorded");
    assert.ok(worst < 0.05, `every recorded pose is one the leader sent (worst ${worst}°)`);
  }

  log("errors", errors);
  log("failed", failed);
  assert.deepEqual(errors, [], "no console errors");
  assert.deepEqual(failed, [], "no failed requests");
  console.log("LIVE LOCALNET: PASS");
} catch (e) {
  const t = await text().catch(() => "");
  console.log("--- page at failure:", page.url());
  console.log(t.split("\n").filter(Boolean).slice(0, 60).join("\n"));
  log("errors", errors);
  log("failed", failed);
  await shot("localnet-failure");
  throw e;
} finally {
  await browser.close();
  stopLeader?.();
}

/**
 * A hand on a physical leader, played back: a pick-and-place from the task's
 * start to its goal, solved into SO-101 joint angles with the station's own
 * chain, sent as the AS5600 firmware sends them (test/fake-leader.py, on a
 * pseudo-terminal) and read by the real arm relay with --leader.
 */
var stopLeader;
async function startLeader() {
  const c = new So101Chain();
  const fk = () => { const p = new THREE.Vector3().setFromMatrixPosition(c.tcpPose()); return [p.x / 1000, p.y / 1000, p.z / 1000]; };
  const home = fk();
  const OPEN = 46, SHUT = 7;
  const legs = [
    [[0.22, 0.14, 0.12], 2.0, OPEN], [[0.22, 0.14, 0.05], 1.0, OPEN], [[0.22, 0.14, 0.05], 0.6, SHUT],
    [[0.22, 0.14, 0.16], 1.0, SHUT], [[0.16, -0.18, 0.16], 2.0, SHUT], [[0.16, -0.18, 0.07], 1.0, SHUT],
    [[0.16, -0.18, 0.07], 0.6, OPEN], [[0.16, -0.18, 0.18], 0.8, OPEN],
  ];
  const poses = [[...SO101.homeDeg]];
  let from = home, jaw = SO101.homeDeg[5];
  for (const [to, secs, toJaw] of legs) {
    const n = Math.round(secs * 50);
    for (let i = 1; i <= n; i++) {
      const u = i / n, e = u * u * (3 - 2 * u);
      solveSo101(c, from.map((f, k) => f + (to[k] - f) * e));
      poses.push([...c.q.slice(0, 5).map((v) => +v.toFixed(3)), +(jaw + (toJaw - jaw) * e).toFixed(3)]);
    }
    from = to; jaw = toJaw;
  }
  const file = join(tmpdir(), `thenar-leader-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(poses));
  const fakeLeader = spawn("python3", [fileURLToPath(new URL("./fake-leader.py", import.meta.url)), file, "--calibrated"]);
  let err = "";
  fakeLeader.stderr.on("data", (d) => (err += d));
  const pty = await Promise.race([
    new Promise((ok) => fakeLeader.stdout.once("data", (d) => ok(String(d).split("\n")[0].trim()))),
    new Promise((_, no) => setTimeout(() => no(new Error(`the fake leader did not start: ${err}`)), 5000)),
  ]);
  const relay = spawn(process.execPath, ["scripts/arm-relay.mjs", "--leader", pty, "--port", RELAY_PORT]);
  let out = "";
  relay.stdout.on("data", (d) => (out += d));
  relay.stderr.on("data", (d) => (out += d));
  await until(async () => out.includes("THENAR arm relay on"), 10_000, "the relay");
  stopLeader = () => { relay.kill(); fakeLeader.kill(); };
  log("leader", { pty, poses: poses.length, seconds: poses.length / 50 });
  return { leaderPoses: poses, fakeLeader, relay };
}
