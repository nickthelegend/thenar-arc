/**
 * The Gateway routes against a running app and Circle's real Gateway API.
 *
 *   BASE=http://localhost:9020 node --import ./test/register.mjs test/live-gateway.mjs
 *
 * A mint can only complete for a depositor Circle holds a balance for, so this
 * checks everything up to that point with a fresh key: the balance read, the
 * intent and signature checks this server makes before calling Circle, and
 * that Circle itself is asked and refuses an unfunded intent (not this server).
 */
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildBurnIntent, burnIntentToJson, burnIntentTypedData, gatewayFor } from "../lib/gateway.ts";

const BASE = process.env.BASE ?? "http://localhost:9010";
const g = gatewayFor("testnet");
const who = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());

const bal = await (await fetch(`${BASE}/api/gateway/balance?address=${who.address}`)).json();
assert.equal(bal.total, "0");
assert.equal(bal.balances.length, g.sources.length);
console.log(`balance   ${who.address}: ${bal.total} across ${bal.balances.length} domains (Circle's Gateway API)`);

const intent = buildBurnIntent(g, { sourceDomain: 6, depositor: who.address, recipient: who.address, value: 1_000_000n, salt: keccak256(toHex(`t${Date.now()}`)) });
const post = (body) => fetch(`${BASE}/api/gateway/mint`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

// Signed by someone else: refused here, before Circle is asked.
const forged = await other.signTypedData(burnIntentTypedData(intent));
let r = await post({ burnIntent: burnIntentToJson(intent), signature: forged });
assert.equal(r.status, 400);
assert.match(r.body.error, /signed by its depositor/);
console.log(`forged    400 ${r.body.error}`);

// A tampered intent (someone else's minter as the destination): refused here.
const json = burnIntentToJson(intent);
const tampered = { ...json, spec: { ...json.spec, destinationContract: `0x${"11".repeat(32)}` } };
r = await post({ burnIntent: tampered, signature: forged });
assert.equal(r.status, 400);
assert.match(r.body.error, /destinationContract/);
console.log(`tampered  400 ${r.body.error}`);

// Properly signed but unfunded: this server passes it to Circle, and Circle refuses.
const signature = await who.signTypedData(burnIntentTypedData(intent));
r = await post({ burnIntent: burnIntentToJson(intent), signature });
assert.ok(r.status === 400 || r.status === 502, `expected Circle's refusal, got ${r.status}`);
assert.ok(!/signed by its depositor|burnIntent:/.test(r.body.error), "refused by Circle, not by this server's checks");
console.log(`unfunded  ${r.status} Circle: ${r.body.error}`);
console.log("ok");
