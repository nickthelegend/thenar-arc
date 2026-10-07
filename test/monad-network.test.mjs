import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { callData, commissionPct, p256Input, p256Valid, CANONICAL } from "../lib/monad-network.ts";

test("the staking calls use the selectors Monad's docs list", () => {
  assert.equal(callData.getEpoch(), "0x757991a8");
  assert.equal(callData.getProposerValId(), "0xfbacb0be");
  assert.equal(callData.getValidator(89n).slice(0, 10), "0x2b6d639a");
});

test("commission is a fraction times 1e18", () => {
  assert.equal(commissionPct(10n ** 17n), 10);
  assert.equal(commissionPct(0n), 0);
  assert.equal(commissionPct(10n ** 18n), 100);
});

test("a WebCrypto P-256 signature lays out as the precompile's 160-byte input", async () => {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const msg = webcrypto.getRandomValues(new Uint8Array(32));
  const hash = new Uint8Array(await webcrypto.subtle.digest("SHA-256", msg));
  const sig = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, msg));
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", kp.publicKey));
  const input = p256Input(hash, sig, raw);
  assert.equal((input.length - 2) / 2, 160);
  assert.ok(input.startsWith("0x" + Buffer.from(hash).toString("hex")));
  assert.ok(input.endsWith(Buffer.from(raw.slice(33)).toString("hex")), "ends with qy");
  assert.throws(() => p256Input(hash.slice(1), sig, raw), /32-byte hash/);
});

test("only a 32-byte word ending in 1 means valid", () => {
  assert.equal(p256Valid("0x" + "0".repeat(63) + "1"), true);
  assert.equal(p256Valid("0x"), false);
  assert.equal(p256Valid("0x" + "0".repeat(64)), false);
});

test("every canonical address is a well-formed address with a stated use", () => {
  for (const c of CANONICAL) {
    assert.match(c.address, /^0x[0-9a-fA-F]{40}$/, c.name);
    assert.ok(c.use.length > 10, c.name);
  }
});
