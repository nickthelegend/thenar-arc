import "server-only";
import { randomBytes } from "node:crypto";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { CORPUS_SHARES, PASSKEY_ADDRESS } from "@/lib/chain";
import { CORPUS_SHARES_ABI } from "@/lib/registry-abi";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { monad } from "@/lib/server/monad";
import { queryOne, run } from "@/lib/server/sql";
import { assertionDigest, derToRs, rpIdHash } from "@/lib/webauthn";

/**
 * Who may earn on Thenar: an address whose owner holds a passkey.
 *
 * The passkey's P-256 public key is registered on chain, in PasskeyRegistry,
 * from the operator's own wallet. To join the CorpusShares whitelist, which
 * is what the verifier checks before it signs a run, the passkey signs a
 * one-time challenge from this server with user verification (Face ID, a
 * fingerprint, a PIN), and the registry checks that signature on chain
 * through Monad's P-256 precompile. So the whitelist holds addresses a
 * person has shown up for, on a device, and the chain is the only record of
 * it.
 */

export class OperatorError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const CHALLENGE_MS = 5 * 60_000;

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Whether an address is on the CorpusShares whitelist: the one gate every paid run passes. */
export async function isOperator(address: string): Promise<boolean> {
  if (!isAddress(CORPUS_SHARES) || !isAddress(address)) return false;
  return (await monad.readContract({
    address: CORPUS_SHARES, abi: CORPUS_SHARES_ABI, functionName: "isInControlList", args: [getAddress(address)],
  })) as boolean;
}

/** Whether an address has a passkey registered on chain. */
export async function hasPasskey(address: string): Promise<boolean> {
  if (!isAddress(PASSKEY_ADDRESS) || !isAddress(address)) return false;
  return (await monad.readContract({
    address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "hasPasskey", args: [getAddress(address)],
  })) as boolean;
}

/** A fresh challenge for this address's passkey to sign, as base64url. */
export async function challengeFor(address: string): Promise<string> {
  if (!isAddress(address)) throw new OperatorError("address must be an address");
  const nonce = b64url(randomBytes(32));
  await run(`INSERT INTO operator_challenge (nonce, address, expires_at) VALUES (?, ?, ?)`, [
    nonce, address.toLowerCase(), Date.now() + CHALLENGE_MS,
  ]);
  return nonce;
}

export type Assertion = {
  /** base64url, as WebAuthn returns them. */
  authenticatorData: string;
  clientDataJSON: string;
  /** base64url DER-encoded ECDSA signature. */
  signature: string;
};

/** Hosts a passkey assertion may come from: this site, and a developer's own machine. */
function originAllowed(origin: string, requestOrigin: string | null): boolean {
  try {
    const u = new URL(origin);
    if (requestOrigin && origin === requestOrigin) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return u.protocol === "https:" && (u.hostname === "thenar.io" || u.hostname.endsWith(".thenar.io"));
  } catch {
    return false;
  }
}

/**
 * Check a passkey assertion over a challenge this server issued, and have the
 * registry verify its signature against the key registered to `address`.
 * Returns the digest the passkey signed.
 */
export async function verifyAssertion(address: string, a: Assertion, requestOrigin: string | null): Promise<Hex> {
  if (!isAddress(address)) throw new OperatorError("address must be an address");
  if (!a || typeof a.authenticatorData !== "string" || typeof a.clientDataJSON !== "string" || typeof a.signature !== "string") {
    throw new OperatorError("The passkey's answer is incomplete.");
  }
  const clientData = fromB64url(a.clientDataJSON);
  const authData = fromB64url(a.authenticatorData);
  let c: { type?: string; challenge?: string; origin?: string };
  try {
    c = JSON.parse(clientData.toString("utf8"));
  } catch {
    throw new OperatorError("The passkey's client data is not JSON.");
  }
  if (c.type !== "webauthn.get") throw new OperatorError("That is not a passkey sign-in.");
  if (!c.origin || !originAllowed(c.origin, requestOrigin)) throw new OperatorError(`A passkey from ${c.origin} cannot sign for this site.`, 403);

  // The authenticator binds the site (rpIdHash) and says a person was there
  // (UP) and was verified by the device, with a face, a finger or a PIN (UV).
  if (authData.length < 37) throw new OperatorError("The authenticator data is too short.");
  const rpHash = authData.subarray(0, 32);
  if (!Buffer.from(await rpIdHash(new URL(c.origin).hostname)).equals(rpHash)) throw new OperatorError("The passkey belongs to another site.", 403);
  const flags = authData[32];
  if (!(flags & 0x01)) throw new OperatorError("The passkey did not register a person present.", 403);
  if (!(flags & 0x04)) throw new OperatorError("The device did not verify you (Face ID, fingerprint or PIN). Try again with it on.", 403);

  // One use per challenge, and only for the address it was issued to.
  const row = await queryOne<{ address: string; expires_at: number; used_at: number | null }>(
    `SELECT address, expires_at, used_at FROM operator_challenge WHERE nonce = ?`, [c.challenge ?? ""],
  );
  if (!row || row.address !== address.toLowerCase()) throw new OperatorError("That challenge was not issued to this address.", 403);
  if (row.used_at) throw new OperatorError("That challenge has already been used. Ask for a new one.", 409);
  if (Number(row.expires_at) < Date.now()) throw new OperatorError("That challenge has expired. Ask for a new one.", 410);
  await run(`UPDATE operator_challenge SET used_at = ? WHERE nonce = ? AND used_at IS NULL`, [Date.now(), c.challenge]);

  // WebAuthn ES256 signs sha256(authenticatorData ‖ sha256(clientDataJSON)).
  // That hash is what the P-256 precompile takes, so the registry can check it.
  const digest = await assertionDigest(authData, clientData);
  let r: Hex, s: Hex;
  try {
    ({ r, s } = derToRs(fromB64url(a.signature)));
  } catch (e) {
    throw new OperatorError(e instanceof Error ? e.message : "The signature is not P-256.");
  }
  if (!(await hasPasskey(address))) throw new OperatorError("No passkey is registered on chain for this address.", 403);
  const ok = (await monad.readContract({
    address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "verify", args: [getAddress(address) as Address, digest, r, s],
  })) as boolean;
  if (!ok) throw new OperatorError("The registry on Monad did not accept the passkey's signature.", 403);
  return digest;
}
