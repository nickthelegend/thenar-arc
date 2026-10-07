/**
 * Live: only the owner's passkey moves their SO-101.
 *
 * In a real browser, with Chromium's virtual authenticator standing in for
 * Face ID, the owner's passkey is made with Mera, and the arm key is derived
 * from its PRF (lib/robot-key.ts). The relay starts with --owner set to that
 * key, in front of a follower on a pseudo-terminal that answers like
 * thenar-arms' firmware. Frames the page signs with the owner's passkey arm the
 * follower and reach it. Frames from a second passkey stop it.
 *
 *   HARNESS=http://localhost:8124 node --import ./test/register.mjs test/live-arm-owner.mjs
 * (HARNESS serves lib/passkey, lib/robot-key and lib/robot-command bundled as
 * window.PK, window.RK and window.RC.)
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HARNESS = process.env.HARNESS ?? "http://localhost:8124";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 30)); } throw new Error("timed out"); };

const b = await chromium.launch({ headless: false, executablePath: process.env.CHROMIUM });
async function passkeyPage() {
  const p = await b.newPage();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
  await p.goto(`${HARNESS}/index.html`);
  return p;
}
const owner = await passkeyPage();
const address = "0x2222222222222222222222222222222222222222";
const ownerKey = await owner.evaluate(async (a) => {
  await window.PK.createPasskey(a);
  const s = await window.RK.robotSession(a);
  const k = window.RC.toHex(s.publicKey); s.end(); return k;
}, address);
assert.match(ownerKey, /^[0-9a-f]{64}$/);

const fw = spawn("python3", [fileURLToPath(new URL("./fake-follower.py", import.meta.url))]);
const lines = []; let path;
fw.stdout.on("data", (d) => { for (const l of String(d).split("\n").filter(Boolean)) path ? lines.push(l) : (path = l); });
await until(() => path);
const PORT = 19700 + Math.floor(Math.random() * 200);
const relay = spawn(process.execPath, ["scripts/arm-relay.mjs", "--port", String(PORT), "--follower", path, "--arm", "--owner", ownerKey], { cwd: ROOT });
let out = ""; relay.stdout.on("data", (d) => (out += d)); relay.stderr.on("data", (d) => (out += d));
await until(() => out.includes("THENAR arm relay on"));

// The page signs each frame exactly as components/station/arm-link.tsx does.
const stream = (page, a, n) => page.evaluate(async ({ a, n, port }) => {
  const s = await window.RK.robotSession(a);
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const status = await new Promise((r) => (ws.onmessage = (e) => r(JSON.parse(e.data))));
  for (let seq = 1; seq <= n; seq++) {
    const q = [0, -25, 35, 0, 0, 20], ts = Date.now();
    const sig = await s.signMessage(window.RC.commandMessage(seq, ts, q));
    ws.send(JSON.stringify({ type: "state", q, seq, ts, sig: window.RC.toHex(sig) }));
    await new Promise((r) => setTimeout(r, 40));
  }
  s.end();
  return { relayOwner: status.owner };
}, { a, n, port: PORT });

try {
  const first = await stream(owner, address, 6);
  assert.equal(first.relayOwner, ownerKey, "the relay reports the owner's key");
  await until(() => lines.includes("ARM"));
  assert.ok(lines.some((l) => l.startsWith("Q ")), "the owner's signed frames reach the arm");

  lines.length = 0;
  const other = await passkeyPage();
  await other.evaluate(async (a) => { await window.PK.createPasskey(a); }, address);
  await stream(other, address, 3);
  await until(() => lines.at(-1) === "STOP");
  assert.ok(!lines.some((l) => l.startsWith("Q ")), "another passkey's frames never reach the arm");
  console.log(JSON.stringify({ ownerKey: ownerKey.slice(0, 16) + "…", ownerMoved: true, strangerStopped: true }));
  console.log("LIVE ARM OWNER: PASS");
} finally {
  await b.close(); relay.kill(); fw.kill();
}
