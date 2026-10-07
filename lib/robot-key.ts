/**
 * The key that drives an operator's own SO-101: derived from their passkey.
 *
 * Mera evaluates the passkey's PRF with a salt that means "SO-101 commands"
 * and nothing else, HKDF turns that into an Ed25519 seed, and Mera holds it in
 * a signing session that zeroes the key when it ends. The same passkey on any
 * device it syncs to reproduces the same key, so the arm follows its owner and
 * nobody else, and nothing about the key is ever stored.
 */
import { createEd25519SigningSession, type Ed25519SigningSession } from "@category-labs/mera";
import { passkeySecret } from "@/lib/passkey";

export async function robotSession(address: string): Promise<Ed25519SigningSession> {
  const prf = await passkeySecret(address, "so101-commands");
  try {
    const ikm = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveBits"]);
    const seed = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("thenar so101 command key v1") },
      ikm, 256,
    ));
    try {
      return createEd25519SigningSession({ privateKey: seed });
    } finally {
      seed.fill(0);
    }
  } finally {
    prf.fill(0);
  }
}
