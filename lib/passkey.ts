/**
 * The operator's passkey: a real one, made by the device (Face ID, a
 * fingerprint, Windows Hello, a security key), through Mera.
 *
 * Mera (@category-labs/mera, Monad's passkey library) runs the WebAuthn
 * ceremonies and hands back PRF output: key material only this passkey can
 * reproduce, on any device it syncs to. It does not hand back the passkey's
 * own P-256 public key, which PasskeyRegistry on Monad needs, or the signed
 * assertion the registry checks. So it runs them through a WebAuthn client of
 * ours that keeps both: the browser's own ceremony, with a note taken.
 *
 * What is stored, in this browser only: the credential id and its transports.
 * Both are public. The private key never leaves the authenticator, and no PRF
 * output or derived key is ever stored.
 */
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, type WebAuthnClient } from "@category-labs/mera";
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

type Captured = { spki?: ArrayBuffer | null; credentialId?: string; transports?: string[]; assertion?: Assertion };

/**
 * The browser's WebAuthn, as Mera would call it, keeping what Mera discards.
 * `challenge` replaces Mera's random one when the assertion has to answer a
 * challenge from the server.
 */
function capturingClient(challenge?: Uint8Array): { client: WebAuthnClient; captured: Captured } {
  const captured: Captured = {};
  const client: WebAuthnClient = {
    async createCredential(r) {
      const c = (await navigator.credentials.create({
        publicKey: {
          rp: r.rp,
          user: r.user,
          challenge: r.challenge,
          // P-256 only: the curve Monad's precompile verifies.
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
          attestation: "none",
          timeout: r.timeout,
          extensions: { prf: { eval: { first: r.prfSalt } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!c) throw new Error("No passkey was made.");
      const res = c.response as AuthenticatorAttestationResponse;
      captured.spki = res.getPublicKey();
      captured.credentialId = b64url(c.rawId);
      captured.transports = res.getTransports?.();
      const prf = (c.getClientExtensionResults() as { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }).prf;
      return {
        credentialId: new Uint8Array(c.rawId),
        transports: res.getTransports?.() as WebAuthnClient.CreateCredentialResult["transports"],
        prfEnabled: prf?.enabled === true || !!prf?.results?.first,
        ...(prf?.results?.first ? { prfOutput: new Uint8Array(prf.results.first) } : {}),
      };
    },
    async getCredential(r) {
      const c = (await navigator.credentials.get({
        publicKey: {
          rpId: r.rpId,
          challenge: (challenge ?? r.challenge) as BufferSource,
          allowCredentials: r.allowCredential
            ? [{ type: "public-key", id: r.allowCredential.credentialId, transports: r.allowCredential.transports as AuthenticatorTransport[] }]
            : undefined,
          userVerification: "required",
          timeout: r.timeout,
          extensions: { prf: { eval: { first: r.prfSalt } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!c) throw new Error("The passkey did not answer.");
      const res = c.response as AuthenticatorAssertionResponse;
      captured.assertion = {
        authenticatorData: b64url(res.authenticatorData),
        clientDataJSON: b64url(res.clientDataJSON),
        signature: b64url(res.signature),
      };
      const prf = (c.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf;
      return { credentialId: new Uint8Array(c.rawId), ...(prf?.results?.first ? { prfOutput: new Uint8Array(prf.results.first) } : {}) };
    },
  };
  return { client, captured };
}

/**
 * Make a new passkey for this operator address. Mera runs the ceremony and
 * evaluates its PRF, where the authenticator supports it; the P-256 key comes
 * back either way, because the key is what the registry needs.
 */
export async function createPasskey(address: string): Promise<StoredPasskey> {
  const { client, captured } = capturingClient();
  const rp = { id: location.hostname, name: "Thenar" };
  const user = { name: `thenar-${address.slice(2, 8).toLowerCase()}`, displayName: `Thenar operator ${address.slice(0, 6)}…${address.slice(-4)}` };
  let prf = false;
  try {
    const made = await createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client });
    prf = true;
    made.prfOutput.fill(0);
  } catch (e) {
    // Mera refuses a passkey without PRF. The passkey still exists and still
    // proves a person was there, so it is kept; only the PRF keys are missing.
    if (!captured.spki) throw e;
  }
  if (!captured.spki || !captured.credentialId) throw new Error("The browser did not return the passkey's public key.");
  const saved: StoredPasskey = {
    credentialId: captured.credentialId,
    transports: captured.transports,
    ...coordsOfSpki(new Uint8Array(captured.spki)),
    prf,
  };
  try { localStorage.setItem(STORE + address.toLowerCase(), JSON.stringify(saved)); } catch { /* storage unavailable */ }
  return saved;
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
 * Mera evaluates the passkey's PRF with a salt made from the purpose, so each
 * purpose gets its own independent 32 bytes, on any device the passkey has
 * synced to. The caller derives what it needs and zeroes the bytes after.
 */
export async function passkeySecret(address: string, purpose: string): Promise<Uint8Array> {
  const stored = storedPasskey(address);
  const salt = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`thenar:${purpose}:v1`)));
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: location.hostname,
    prfSalt: salt,
    ...(stored?.credentialId
      ? { credential: { credentialId: stored.credentialId, transports: stored.transports as never } }
      : {}),
  });
  return prfOutput;
}
