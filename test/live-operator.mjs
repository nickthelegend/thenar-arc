/**
 * Live: the passkey gate, over HTTP, with real P-256 assertions.
 *
 *   BASE=http://localhost:3334 node test/live-operator.mjs
 *
 * A fresh address and a fresh P-256 key sign WebAuthn-shaped assertions over
 * challenges the server issues. Every refusal the gate makes is checked for
 * its reason, and the last step, a correct assertion from an address with no
 * key on chain, is refused only at the registry. Nothing is written on chain
 * and no admission is attempted, so this spends nothing.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3334";
const sha = (...b) => { const h = createHash("sha256"); for (const x of b) h.update(x); return h.digest(); };
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const address = "0x" + randomBytes(20).toString("hex");
const other = "0x" + randomBytes(20).toString("hex");

// The route allows 12 requests a minute per caller; a person needs two.
const pace = () => new Promise((r) => setTimeout(r, 5200));
const post = async (body) => (await pace(), fetch(`${BASE}/api/operator`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() })));
const challenge = async (who = address) => (await post({ action: "challenge", address: who })).body.challenge;
function assertion(ch, { rpId = new URL(BASE).hostname, origin = BASE, flags = 0x05, type = "webauthn.get" } = {}) {
  const authData = Buffer.concat([sha(Buffer.from(rpId)), Buffer.from([flags]), Buffer.from([0, 0, 0, 7])]);
  const clientData = Buffer.from(JSON.stringify({ type, challenge: ch, origin }));
  return { authenticatorData: b64url(authData), clientDataJSON: b64url(clientData), signature: b64url(sign("sha256", Buffer.concat([authData, sha(clientData)]), privateKey)) };
}
const admit = (ch, opts, who = address) => post({ action: "admit", address: who, assertion: assertion(ch, opts) });
const results = {};
const expect = (name, got, status, re) => {
  results[name] = `${got.status} ${got.body.error ?? JSON.stringify(got.body).slice(0, 80)}`;
  assert.equal(got.status, status, `${name}: ${results[name]}`);
  if (re) assert.match(got.body.error ?? "", re, name);
};

const st = await fetch(`${BASE}/api/operator?address=${address}`).then((r) => r.json());
assert.deepEqual([st.passkey, st.operator], [false, false]);

expect("no user verification", await admit(await challenge(), { flags: 0x01 }), 403, /did not verify you/);
expect("foreign origin", await admit(await challenge(), { origin: "https://evil.example" }), 403, /cannot sign for this site/);
expect("wrong relying party", await admit(await challenge(), { rpId: "evil.example" }), 403, /another site/);
expect("not a sign-in", await admit(await challenge(), { type: "webauthn.create" }), 400, /not a passkey sign-in/);
expect("challenge made up", await admit(b64url(randomBytes(32))), 403, /not issued to this address/);
expect("challenge for someone else", await admit(await challenge(other)), 403, /not issued to this address/);
const ch = await challenge();
expect("correct, but no key on chain", await admit(ch), 403, /No passkey is registered on chain/);
expect("replayed", await admit(ch), 409, /already been used/);

const run = { taskId: 0, contributor: address, durationSeconds: 5, deviationMm: 0, success: true, samples: [] };
const v = await fetch(`${BASE}/api/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(run) });
const vb = await v.json();
results["/api/verify without a passkey"] = `${v.status} ${vb.error}`;
assert.equal(v.status, 403); assert.equal(vb.passkeyRequired, true);

console.log(JSON.stringify(results, null, 1));
console.log("LIVE OPERATOR GATE: PASS");
