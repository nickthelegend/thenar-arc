/**
 * The operator's passkey: a real one, made by the device (Face ID, a
 * fingerprint, Windows Hello, a security key), through the browser's own
 * WebAuthn.
 *
 * Two things come out of it:
 *  - its P-256 public key, which PasskeyRegistry on Arc binds to the
 *    operator's address. Arc verifies the passkey's signatures on chain
 *    through its P-256 precompile at 0x0100, so a paid run comes from a person;
 *  - PRF output (the WebAuthn `prf` extension): 32 bytes only this passkey can
 *    reproduce, per salt, on any device it syncs to. lib/robot-key.ts turns it
 *    into the key that commands an operator's own SO-101.
 *
 * What is stored, in this browser only: the credential id, its transports and
 * the public key. All public. The private key never leaves the authenticator,
 * and no PRF output or derived key is ever stored.
 */
import { coordsOfSpki } from "@/lib/webauthn";

const STORE = "thenar:passkey:v2:";

export const b64url = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export type StoredPasskey = { credentialId: string; transports?: string[]; x: `0x${string}`; y: `0x${string}`; prf: boolean };
export type Assertion = { authenticatorData: string; clientDataJSON: string; signature: string };

export function storedPasskey(address: string): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(STORE + address.toLowerCase());
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch {
    return null;
  }
}
export function forgetPasskey(address: string) {
  try { localStorage.removeItem(STORE + address.toLowerCase()); } catch { /* storage unavailable */ }
}

/** Whether this browser can make a passkey at all. */
export const passkeysAvailable = () =>
  typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && !!navigator.credentials;

/**
 * Whether this page's address can own a passkey at all. WebAuthn binds a
 * passkey to a domain name, and refuses an IP address outright, so a site
 * opened at 127.0.0.1 fails with nothing more useful than "creation failed".
 */
export const passkeyHostOk = () =>
  typeof window === "undefined" || !/^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])$/i.test(window.location.hostname);

export type PasskeyErrorCode = "PRF_UNAVAILABLE" | "PASSKEY_OPERATION_FAILED" | "UNSUPPORTED";

/** A passkey ceremony that failed, with the reason a page can act on. */
export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  constructor(code: PasskeyErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
export const isPasskeyError = (e: unknown): e is PasskeyError => e instanceof PasskeyError;

const enc = new TextEncoder();
/** A PRF salt for one named purpose: SHA-256 of a readable label, so salts are auditable and never collide. */
export async function prfSalt(purpose: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`thenar:${purpose}:v1`)));
}
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | Uint8Array } } };
function prfOf(c: PublicKeyCredential): Uint8Array | null {
  const first = (c.getClientExtensionResults() as PrfResults).prf?.results?.first;
  return first ? new Uint8Array(first instanceof Uint8Array ? first : new Uint8Array(first)) : null;
}

async function ceremony<T>(fn: () => Promise<T>): Promise<T> {
  if (!passkeysAvailable()) throw new PasskeyError("UNSUPPORTED", "This browser cannot use passkeys here (it needs a secure context).");
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PasskeyError) throw e;
    throw new PasskeyError("PASSKEY_OPERATION_FAILED", e instanceof Error ? e.message : "The passkey prompt failed.");
  }
}

/**
 * Make a new passkey for this operator address: P-256 only (alg -7, the curve
 * Arc's precompile verifies), discoverable, user-verified, with PRF asked for
 * at creation. The public key comes back from the attestation either way; PRF
 * is recorded as available when the authenticator enabled it.
 */
export async function createPasskey(address: string): Promise<StoredPasskey> {
  return ceremony(async () => {
    const salt = await prfSalt("passkey");
    const c = (await navigator.credentials.create({
      publicKey: {
        rp: { id: location.hostname, name: "Thenar" },
        user: {
          id: random(16),
          name: `thenar-${address.slice(2, 8).toLowerCase()}`,
          displayName: `Thenar operator ${address.slice(0, 6)}…${address.slice(-4)}`,
        },
        challenge: random(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        attestation: "none",
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!c) throw new PasskeyError("PASSKEY_OPERATION_FAILED", "No passkey was made.");
    const res = c.response as AuthenticatorAttestationResponse;
    const spki = res.getPublicKey();
    if (!spki) throw new PasskeyError("PASSKEY_OPERATION_FAILED", "The browser did not return the passkey's public key.");
    const ext = (c.getClientExtensionResults() as PrfResults).prf;
    const out = prfOf(c);
    out?.fill(0);
    const saved: StoredPasskey = {
      credentialId: b64url(c.rawId),
      transports: res.getTransports?.(),
      ...coordsOfSpki(new Uint8Array(spki)),
      prf: ext?.enabled === true || Boolean(out),
    };
    try { localStorage.setItem(STORE + address.toLowerCase(), JSON.stringify(saved)); } catch { /* storage unavailable */ }
    return saved;
  });
}

/** Sign a challenge from the server with this operator's passkey. */
export async function signChallenge(address: string, challenge: string): Promise<Assertion> {
  const stored = storedPasskey(address);
  const c = (await navigator.credentials.get({
    publicKey: {
      rpId: location.hostname,
      challenge: fromB64url(challenge),
      allowCredentials: stored?.credentialId
        ? [{ type: "public-key", id: fromB64url(stored.credentialId), transports: stored.transports as AuthenticatorTransport[] }]
        : undefined,
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;
  if (!c) throw new Error("The passkey did not answer.");
  const res = c.response as AuthenticatorAssertionResponse;
  return { authenticatorData: b64url(res.authenticatorData), clientDataJSON: b64url(res.clientDataJSON), signature: b64url(res.signature) };
}

/**
 * Key material only this passkey can reproduce, for one named purpose.
 *
 * One WebAuthn assertion evaluates the passkey's PRF with a salt made from the
 * purpose, so each purpose gets its own independent 32 bytes, on any device
 * the passkey has synced to. The caller derives what it needs and zeroes the
 * bytes after.
 */
export async function passkeySecret(address: string, purpose: string): Promise<Uint8Array> {
  const stored = storedPasskey(address);
  const salt = await prfSalt(purpose);
  return ceremony(async () => {
    const c = (await navigator.credentials.get({
      publicKey: {
        rpId: location.hostname,
        challenge: random(32),
        userVerification: "required",
        allowCredentials: stored?.credentialId
          ? [{ type: "public-key", id: fromB64url(stored.credentialId), transports: stored.transports as AuthenticatorTransport[] }]
          : [],
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!c) throw new PasskeyError("PASSKEY_OPERATION_FAILED", "The passkey did not answer.");
    const out = prfOf(c);
    if (!out) {
      throw new PasskeyError(
        "PRF_UNAVAILABLE",
        "This passkey cannot make keys: its provider does not support WebAuthn PRF.",
      );
    }
    return out;
  });
}
