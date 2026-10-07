import "server-only";
import { createWalletClient, fallback, http, type Account, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appChain, RPC_ENDPOINTS } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";

/**
 * The server's own reads and writes on Arc, and the keys that make them.
 *
 * Each role is its own key, because each is its own authority:
 *  - the corpus issuer (CORPUS_ISSUER_PRIVATE_KEY) admits verified humans to
 *    CorpusShares, issues their shares, declares USDC dividends and logs every
 *    corpus sale to SalesLog. It is deliberately not the verifier: that key
 *    signs scores, lives only in the signer service, and /api/health fails if
 *    it drifts into this one.
 *  - the relayer (RELAYER_PRIVATE_KEY) submits what someone else signed: a
 *    sponsor's EIP-3009 authorization to fund a task, a Gateway mint. It holds
 *    a little USDC for gas and can move nobody's money but its own.
 *  - the x402 facilitator (X402_FACILITATOR_PRIVATE_KEY) settles an agent's
 *    EIP-3009 payment for a corpus, paying the gas in USDC.
 *  - the auditor (AUDITOR_PRIVATE_KEY, defaulting to the issuer) writes the
 *    keeper's findings to CorpusAudit.
 *
 * Gas on Arc is USDC, so every one of these wallets is funded in USDC.
 */
export const arc = chainClient();

export class IssuerUnavailable extends Error {}
export class KeyUnavailable extends Error {}

type Signer = { account: Account; wallet: ReturnType<typeof makeWallet> };

function makeWallet(account: Account) {
  return createWalletClient({
    account,
    chain: appChain,
    transport: fallback(RPC_ENDPOINTS.map((url) => http(url, { retryCount: 1 })), { rank: false }),
  });
}

const cache = new Map<string, Signer>();

function signerFor(key: string): Signer {
  let s = cache.get(key);
  if (!s) {
    const account = privateKeyToAccount(key as Hex);
    s = { account, wallet: makeWallet(account) };
    cache.set(key, s);
  }
  return s;
}

function keyed(envName: string, what: string, Err: new (m: string) => Error = KeyUnavailable): Signer {
  const key = process.env[envName]?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Err(`${envName} is not set, so this server cannot ${what} on Arc.`);
  }
  return signerFor(key);
}

/** The corpus issuer: shares, dividends, the sales log. */
export function issuerWallet() {
  return keyed("CORPUS_ISSUER_PRIVATE_KEY", "issue shares or log sales", IssuerUnavailable);
}

/** The relayer: submits a sponsor's signed authorization, or a Gateway mint, and pays the gas. */
export function relayerWallet() {
  return keyed("RELAYER_PRIVATE_KEY", "relay a signed authorization");
}

/** The in-process x402 facilitator: settles an agent's EIP-3009 payment. */
export function facilitatorWallet() {
  return keyed("X402_FACILITATOR_PRIVATE_KEY", "settle x402 payments");
}

/** The keeper's auditor key for CorpusAudit; the issuer's when unset. */
export function auditorWallet() {
  if (process.env.AUDITOR_PRIVATE_KEY?.trim()) return keyed("AUDITOR_PRIVATE_KEY", "write audit findings");
  return keyed("CORPUS_ISSUER_PRIVATE_KEY", "write audit findings");
}

/** Whether a role's key is configured, without throwing. */
export const hasKey = (envName: string) => /^0x[0-9a-fA-F]{64}$/.test(process.env[envName]?.trim() ?? "");

/** Serialise writes from one key, so two requests cannot race for a nonce. */
const locks = new Map<string, Promise<unknown>>();
export function withSignerLock<T>(address: string, fn: () => Promise<T>): Promise<T> {
  const k = address.toLowerCase();
  const prev = locks.get(k) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(k, next.catch(() => undefined));
  return next;
}
