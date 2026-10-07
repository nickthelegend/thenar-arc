/**
 * A passkey assertion, checked the way the operator gate checks it.
 *
 * A real P-256 key signs a correctly shaped WebAuthn assertion (the bytes an
 * authenticator signs, ES256, DER). lib/webauthn.ts turns it into the digest
 * and (r, s) the precompile takes. Offline, Node's own P-256 verify must agree
 * with that arithmetic. With LIVE=1, the deployed PasskeyRegistry on Monad
 * checks it through the precompile at 0x0100, and must refuse a tampered one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { assertionDigest, derToRs, coordsOfSpki, rpIdHash } from "../lib/webauthn.ts";

const sha = (...b) => { const h = createHash("sha256"); for (const x of b) h.update(x); return h.digest(); };

function assertion({ rpId = "localhost", flags = 0x05, challenge = "c2FtcGxl" } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const authData = Buffer.concat([sha(Buffer.from(rpId)), Buffer.from([flags]), Buffer.from([0, 0, 0, 1])]);
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: `http://${rpId}:3334` }));
  const der = sign("sha256", Buffer.concat([authData, sha(clientData)]), privateKey);
  const spki = publicKey.export({ format: "der", type: "spki" });
  return { privateKey, publicKey, authData, clientData, der, spki };
}

test("the digest is sha256 of what the authenticator signs", async () => {
  const a = assertion();
  const digest = await assertionDigest(a.authData, a.clientData);
  assert.equal(digest, "0x" + sha(Buffer.concat([a.authData, sha(a.clientData)])).toString("hex"));
  assert.deepEqual(Buffer.from(await rpIdHash("localhost")), a.authData.subarray(0, 32));
});

test("(r, s) from DER, and x, y from SPKI, are the key and signature Node verifies", async () => {
  for (let i = 0; i < 20; i++) {
    const a = assertion();
    const { r, s } = derToRs(a.der);
    const { x, y } = coordsOfSpki(a.spki);
    assert.equal(r.length, 66); assert.equal(s.length, 66); assert.equal(x.length, 66); assert.equal(y.length, 66);
    const p1363 = Buffer.from(r.slice(2) + s.slice(2), "hex");
    assert.ok(verify("sha256", Buffer.concat([a.authData, sha(a.clientData)]), { key: a.publicKey, dsaEncoding: "ieee-p1363" }, p1363));
  }
});

test("Monad's PasskeyRegistry verifies the assertion through the P-256 precompile, and refuses a tampered one", { skip: !process.env.LIVE }, async () => {
  const { createPublicClient, http, parseAbi } = await import("viem");
  const { DEPLOYMENT } = await import("../lib/deployment.ts");
  const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
  const abi = parseAbi(["function verifyWithKey(bytes32 digest, bytes32 r, bytes32 s, bytes32 x, bytes32 y) view returns (bool)"]);
  const a = assertion({ rpId: "thenar.io" });
  const digest = await assertionDigest(a.authData, a.clientData);
  const { r, s } = derToRs(a.der);
  const { x, y } = coordsOfSpki(a.spki);
  const address = DEPLOYMENT.contracts.passkeyRegistry;
  assert.equal(await client.readContract({ address, abi, functionName: "verifyWithKey", args: [digest, r, s, x, y] }), true);
  const tampered = await assertionDigest(a.authData, Buffer.from(a.clientData.toString().replace("thenar.io", "evil.example")));
  assert.equal(await client.readContract({ address, abi, functionName: "verifyWithKey", args: [tampered, r, s, x, y] }), false);
});
