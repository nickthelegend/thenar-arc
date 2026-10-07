/**
 * Live: the operator's passkey, made and used in a real browser.
 *
 * Chromium's virtual authenticator (a full WebAuthn implementation: resident
 * keys, user verification, PRF) stands in for Face ID. The page runs the real
 * lib/passkey.ts, Mera included, bundled as-is:
 *   - createPasskey: Mera's ceremony, with the P-256 key captured for the registry;
 *   - signChallenge: an assertion over a challenge;
 *   - passkeySecret: Mera's PRF output, the same bytes every time for one
 *     purpose and different bytes for another.
 * Then Monad's PasskeyRegistry verifies the assertion with the key the browser
 * reported, through the P-256 precompile.
 *
 *   HARNESS=http://localhost:8124 node --import ./test/register.mjs test/live-passkey.mjs
 * (HARNESS serves an index.html that loads lib/passkey.ts and lib/webauthn.ts
 * bundled as window.PK and window.WA.)
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createPublicClient, http, parseAbi } from "viem";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { assertionDigest, derToRs } from "../lib/webauthn.ts";

const HARNESS = process.env.HARNESS ?? "http://localhost:8124";
const b = await chromium.launch({ headless: false, executablePath: process.env.CHROMIUM });
const p = await b.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const cdp = await p.context().newCDPSession(p);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
});
await p.goto(`${HARNESS}/index.html`);
const address = "0x1111111111111111111111111111111111111111";
const out = await p.evaluate(async (address) => {
  const made = await window.PK.createPasskey(address);
  const challenge = window.PK.b64url(crypto.getRandomValues(new Uint8Array(32)));
  const a = await window.PK.signChallenge(address, challenge);
  const s1 = await window.PK.passkeySecret(address, "so101-commands");
  const s2 = await window.PK.passkeySecret(address, "so101-commands");
  const s3 = await window.PK.passkeySecret(address, "recordings");
  const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
  return { made, challenge, a, clientData: new TextDecoder().decode(window.PK.fromB64url(a.clientDataJSON)), s1: hex(s1), s2: hex(s2), s3: hex(s3) };
}, address);
await b.close();

const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const cd = JSON.parse(out.clientData);
assert.equal(cd.type, "webauthn.get");
assert.equal(cd.challenge, out.challenge, "the assertion answers the challenge it was given");
assert.equal(out.made.prf, true, "Mera evaluated the passkey's PRF");
assert.match(out.made.x, /^0x[0-9a-f]{64}$/); assert.match(out.made.y, /^0x[0-9a-f]{64}$/);
assert.equal(out.s1.length, 64); assert.equal(out.s1, out.s2, "one purpose, the same key material every time");
assert.notEqual(out.s1, out.s3, "another purpose, independent key material");
const flags = fromB64url(out.a.authenticatorData)[32];
assert.ok(flags & 0x04, "user verified");

const digest = await assertionDigest(fromB64url(out.a.authenticatorData), fromB64url(out.a.clientDataJSON));
const { r, s } = derToRs(fromB64url(out.a.signature));
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const ok = await client.readContract({
  address: DEPLOYMENT.contracts.passkeyRegistry,
  abi: parseAbi(["function verifyWithKey(bytes32,bytes32,bytes32,bytes32,bytes32) view returns (bool)"]),
  functionName: "verifyWithKey", args: [digest, r, s, out.made.x, out.made.y],
});
assert.equal(ok, true, "PasskeyRegistry on Monad verified the browser's passkey");
assert.deepEqual(errs, []);
console.log(JSON.stringify({ key: { x: out.made.x.slice(0, 18) + "…", prf: out.made.prf }, uvFlag: !!(flags & 4), prfStable: out.s1 === out.s2, prfSeparated: out.s1 !== out.s3, monadVerified: ok }));
console.log("LIVE PASSKEY: PASS");
