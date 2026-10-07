/**
 * The arithmetic between a WebAuthn assertion and Monad's P-256 precompile,
 * shared by the server that admits operators and the page that lets them
 * check it themselves, so both compute the same digest byte for byte.
 */

const hex = (b: Uint8Array) => `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", all));
}

/**
 * What a passkey's signature is over, hashed once: ES256 signs
 * authenticatorData ‖ sha256(clientDataJSON), and the precompile takes the
 * SHA-256 of the signed message.
 */
export async function assertionDigest(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): Promise<`0x${string}`> {
  return hex(await sha256(authenticatorData, await sha256(clientDataJSON)));
}

/** sha256 of a relying party id, as the first 32 bytes of authenticatorData carry it. */
export async function rpIdHash(rpId: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(rpId));
}

/** The two 32-byte integers inside a DER-encoded ECDSA signature. */
export function derToRs(der: Uint8Array): { r: `0x${string}`; s: `0x${string}` } {
  if (der[0] !== 0x30) throw new Error("The signature is not DER.");
  let i = 2;
  const int = () => {
    if (der[i] !== 0x02) throw new Error("The signature is not DER.");
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error("The signature is not P-256.");
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return hex(out);
  };
  return { r: int(), s: int() };
}

/** x and y of an uncompressed P-256 SubjectPublicKeyInfo: its last 64 bytes. */
export function coordsOfSpki(spki: Uint8Array): { x: `0x${string}`; y: `0x${string}` } {
  if (spki.length < 65 || spki[spki.length - 65] !== 0x04) throw new Error("This key is not an uncompressed P-256 point.");
  return { x: hex(spki.slice(spki.length - 64, spki.length - 32)), y: hex(spki.slice(spki.length - 32)) };
}
