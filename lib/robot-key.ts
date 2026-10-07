/**
 * The key that drives an operator's own SO-101: derived from their passkey.
 *
 * The passkey's WebAuthn PRF is evaluated with a salt that means "SO-101
 * commands" and nothing else, HKDF turns that into an Ed25519 seed, and a
 * signing session holds it in memory until `end()` zeroes it. The same passkey
 * on any device it syncs to reproduces the same key, so the arm follows its
 * owner and nobody else, and nothing about the key is ever stored.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { passkeySecret } from "@/lib/passkey";

/** A live Ed25519 key: sign with it, then end it. */
export type Ed25519SigningSession = {
  publicKey: Uint8Array;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Zeroes the key; signing after this throws. */
  end(): void;
};

export function createEd25519SigningSession(seed: Uint8Array): Ed25519SigningSession {
  if (seed.length !== 32) throw new Error("An Ed25519 key is 32 bytes.");
  const key = new Uint8Array(seed);
  let live = true;
  const publicKey = new Uint8Array(ed25519.getPublicKey(key));
  return {
    publicKey,
    async signMessage(message) {
      if (!live) throw new Error("This signing session has ended.");
      return new Uint8Array(ed25519.sign(message, key));
    },
    end() {
      live = false;
      key.fill(0);
    },
  };
}

export async function robotSession(address: string): Promise<Ed25519SigningSession> {
  const prf = await passkeySecret(address, "so101-commands");
  try {
    const ikm = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveBits"]);
    const seed = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("thenar so101 command key v1") },
      ikm, 256,
    ));
    try {
      return createEd25519SigningSession(seed);
    } finally {
      seed.fill(0);
    }
  } finally {
    prf.fill(0);
  }
}
