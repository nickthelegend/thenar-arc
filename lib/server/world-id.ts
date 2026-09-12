import "server-only";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import type { IDKitResult, RpContext } from "@worldcoin/idkit-core";
import { queryOne, run } from "@/lib/server/sql";

/**
 * A live human, proven before a run is accepted.
 *
 * Thenar pays for demonstrations of a robot arm, and the whole value of that
 * corpus is that a person drove it. A script can drive the station as well as
 * a person can, so a signed run on its own says nothing about who trained the
 * policy. World ID's Selfie Check is the missing statement: a liveness proof
 * made on a phone, bound to the operator's address, and unique per human per
 * action — one person cannot put two wallets on the payroll.
 *
 * Three checks are this server's and not World's, because World's verify
 * endpoint validates the proof and nothing around it:
 *  - the nonce is one this server minted, for this address, and has not expired;
 *  - the signal inside the proof is the operator's address;
 *  - the nullifier has not already been bound to a different address.
 */

/** The action a proof is made for. A name Thenar chooses, registered on its app. */
export const HUMAN_ACTION = process.env.WORLD_HUMAN_ACTION || "thenar-contribute";

export const WORLD_ENVIRONMENT = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT || "production") as
  | "production" | "staging" | "sandbox";

/** Credentials that count as "a live human". Selfie Check is what the station asks for. */
const ACCEPTED = new Set(["selfie", "proof_of_human"]);

export class HumanError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * The World app this server asks on behalf of.
 *
 * All three values come from the Developer Portal and none is assumed: a
 * default app id would quietly send proofs to somebody else's app, where they
 * fail in a way that looks like World being down.
 */
function worldApp(): { appId: `app_${string}`; rpId: string; key: string } {
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  const rpId = process.env.WORLD_RP_ID;
  const key = process.env.WORLD_SIGNING_KEY;
  const missing = [
    !appId && "NEXT_PUBLIC_WORLD_APP_ID",
    !rpId && "WORLD_RP_ID",
    !key && "WORLD_SIGNING_KEY",
  ].filter(Boolean);
  if (missing.length || !appId || !rpId || !key) {
    throw new HumanError(`${missing.join(", ")} not set, so this server cannot ask World for a proof.`, 503);
  }
  return { appId: appId as `app_${string}`, rpId, key };
}

export type HumanRow = {
  nullifier: string;
  address: string;
  credential: string;
  protocol: string;
  action: string;
  environment: string;
  verified_at: number;
};

export type HumanRequest = {
  app_id: `app_${string}`;
  action: string;
  environment: typeof WORLD_ENVIRONMENT;
  signal: string;
  rp_context: RpContext;
};

/**
 * Sign a proof request for one operator address.
 *
 * The nonce is written down before it leaves, keyed to the address, so the
 * proof that comes back can be matched to the request that asked for it.
 */
export async function requestFor(address: string): Promise<HumanRequest> {
  const app = worldApp();
  const who = address.toLowerCase();
  const sig = signRequest({ signingKeyHex: app.key, action: HUMAN_ACTION, ttl: 300 });
  await run(`DELETE FROM world_nonce WHERE expires_at < ?`, [Math.floor(Date.now() / 1000)]);
  await run(`INSERT INTO world_nonce (nonce, address, expires_at) VALUES (?, ?, ?)`, [sig.nonce, who, sig.expiresAt]);

  return {
    app_id: app.appId,
    action: HUMAN_ACTION,
    environment: WORLD_ENVIRONMENT,
    signal: who,
    rp_context: {
      rp_id: app.rpId,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
      signature: sig.sig,
    },
  };
}

/** Check a returned proof end to end, then bind the human to the address. */
export async function verifyHuman(address: string, result: IDKitResult): Promise<HumanRow> {
  const app = worldApp();
  const who = address.toLowerCase();
  if (!result || typeof result !== "object" || !("nonce" in result)) {
    throw new HumanError("No proof was sent.");
  }
  if ("session_id" in result) throw new HumanError("A session proof cannot stand in for a live check.");

  const minted = await queryOne<{ address: string; expires_at: number }>(
    `SELECT address, expires_at FROM world_nonce WHERE nonce = ?`, [result.nonce],
  );
  if (!minted) throw new HumanError("This proof answers a request this server did not make, or one already used. Start again.", 401);
  if (minted.address !== who) throw new HumanError("This proof was requested for a different address.", 401);
  if (Number(minted.expires_at) * 1000 < Date.now()) throw new HumanError("The request expired before the proof came back. Start again.", 401);
  if (result.action !== HUMAN_ACTION) throw new HumanError("This proof was made for a different action.", 401);

  const item = result.responses?.[0];
  if (!item) throw new HumanError("The proof carries no credential.");
  if (!ACCEPTED.has(item.identifier)) throw new HumanError(`A ${item.identifier} credential does not show a live human.`, 401);
  // The signal is the operator's address, so a proof cannot be lifted onto another wallet.
  if (!item.signal_hash || item.signal_hash.toLowerCase() !== hashSignal(who).toLowerCase()) {
    throw new HumanError("This proof is bound to a different address.", 401);
  }

  const res = await fetch(`https://developer.world.org/api/v4/verify/${app.rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "thenar/1.0 (+https://thenar.io)" },
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
  if (!res.ok) throw new HumanError(`World did not accept the proof: ${body.detail ?? body.code ?? res.status}`, 401);

  // Spent, whatever happens next: a proof is good for one binding.
  await run(`DELETE FROM world_nonce WHERE nonce = ?`, [result.nonce]);

  // Stored as a decimal number, as World advises, so hex casing cannot make
  // one human look like two.
  const nullifier = BigInt(item.nullifier).toString();
  const byNullifier = await queryOne<HumanRow>(`SELECT * FROM human WHERE nullifier = ?`, [nullifier]);
  if (byNullifier && byNullifier.address !== who) {
    throw new HumanError("This person has already verified a different operator address.", 409);
  }
  const byAddress = await queryOne<HumanRow>(`SELECT * FROM human WHERE address = ?`, [who]);
  if (byAddress && byAddress.nullifier !== nullifier) {
    throw new HumanError("This address is already bound to a different person.", 409);
  }

  const row: HumanRow = {
    nullifier,
    address: who,
    credential: item.identifier,
    protocol: result.protocol_version,
    action: HUMAN_ACTION,
    environment: result.environment,
    verified_at: Date.now(),
  };
  if (!byNullifier) {
    await run(
      `INSERT INTO human (nullifier, address, credential, protocol, action, environment, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.nullifier, row.address, row.credential, row.protocol, row.action, row.environment, row.verified_at],
    );
  }
  return byNullifier ?? row;
}

export async function humanFor(address: string): Promise<HumanRow | undefined> {
  const row = await queryOne<HumanRow>(`SELECT * FROM human WHERE address = ?`, [address.toLowerCase()]);
  return row ? { ...row, verified_at: Number(row.verified_at) } : undefined;
}
