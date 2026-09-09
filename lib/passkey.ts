"use client";

/**
 * A secp256r1 key, held by the browser and recognised by the chain.
 *
 * The curve is the point. secp256r1 (P-256) is what a passkey, a Secure Enclave
 * and a YubiKey sign with, and it is not the curve Ethereum uses — so verifying
 * one on chain needs the P-256 precompile at 0x0100 (EIP-7951 / RIP-7212),
 * which Avalanche provides. `PasskeyRegistry` binds the public key to an address
 * and checks signatures through it.
 *
 * The private key is generated non-extractable, so it cannot be read out of the
 * browser by this code or any other — it is stored as a `CryptoKey` in
 * IndexedDB, which preserves that property, and only ever used to sign.
 */

const DB = "thenar-passkey";
const STORE = "keys";
const ID = "operator";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: CryptoKeyPair) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(key, ID);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function storedKey(): Promise<CryptoKeyPair | null> {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(ID);
      r.onsuccess = () => res((r.result as CryptoKeyPair) ?? null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}

export async function forgetKey() {
  const db = await idb();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(ID);
    tx.oncomplete = () => res();
  });
}

const hex = (b: ArrayBuffer) =>
  `0x${[...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** Generate and keep a key. The private half is never extractable. */
export async function createKey(): Promise<{ x: `0x${string}`; y: `0x${string}` }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,               // private key cannot leave the browser
    ["sign", "verify"],
  );
  await put(pair);
  return publicCoords(pair);
}

/** The affine coordinates the registry stores, from the public half. */
export async function publicCoords(pair: CryptoKeyPair) {
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const x = fromB64Url(jwk.x!);
  const y = fromB64Url(jwk.y!);
  return { x: hex(x.buffer as ArrayBuffer), y: hex(y.buffer as ArrayBuffer) };
}

/**
 * Sign a challenge and return what the precompile needs.
 *
 * WebCrypto returns the signature as r‖s, each 32 bytes, which is exactly what
 * the precompile takes — no DER unwrapping, and no low-s normalisation, because
 * P-256 verification accepts either.
 */
export async function signChallenge(pair: CryptoKeyPair, message: string) {
  const bytes = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bytes),
  );
  return {
    digest: hex(digest),
    r: hex(sig.slice(0, 32).buffer as ArrayBuffer),
    s: hex(sig.slice(32, 64).buffer as ArrayBuffer),
  };
}


/**
 * Sign a trajectory hash, for on-chain run authorisation.
 *
 * This did not work against v1 and the reason is worth keeping. WebCrypto
 * always hashes what it signs, so signing a trajectory hash produces a
 * signature over sha256(trajHash) — while v1 handed the raw trajHash to the
 * precompile as the digest. Verified against the deployed registry at the
 * time: raw returned false, sha256(trajHash) returned true. No browser could
 * ever satisfy that call, and the path was removed rather than shipped broken.
 *
 * v2 verifies sha256(trajHash), which is what a browser can actually produce.
 * The asymmetry was never in the browser: a raw ECDSA signature over a
 * pre-computed hash needs the private scalar, and a key you can read out of
 * the browser is not a passkey.
 */
export async function signDigest(pair: CryptoKeyPair, digest: `0x${string}`) {
  const bytes = new Uint8Array(
    (digest.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bytes),
  );
  return {
    r: hex(sig.slice(0, 32).buffer as ArrayBuffer),
    s: hex(sig.slice(32, 64).buffer as ArrayBuffer),
  };
}
