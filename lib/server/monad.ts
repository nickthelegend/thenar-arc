import "server-only";
import { createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appChain, RPC_ENDPOINTS } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";

/**
 * The server's own writes to Monad, and the one key that makes them.
 *
 * The corpus issuer admits verified humans to CorpusShares, issues their
 * shares, and logs every corpus sale to SalesLog. It is deliberately not the
 * verifier: that key signs scores, lives only in the signer service, and
 * /api/health fails if it drifts into this one. A key that can mint corpus
 * shares is a different authority from one that can say what a run was worth.
 */
export const monad = chainClient();

export class IssuerUnavailable extends Error {}

let issuer: ReturnType<typeof makeIssuer> | null = null;

function makeIssuer(key: string) {
  const account = privateKeyToAccount(key as `0x${string}`);
  const wallet = createWalletClient({
    account,
    chain: appChain,
    transport: fallback(RPC_ENDPOINTS.map((url) => http(url, { retryCount: 1 })), { rank: false }),
  });
  return { account, wallet };
}

export function issuerWallet() {
  const key = process.env.CORPUS_ISSUER_PRIVATE_KEY;
  if (!key) throw new IssuerUnavailable("CORPUS_ISSUER_PRIVATE_KEY is not set, so this server cannot write to Monad.");
  issuer ??= makeIssuer(key);
  return issuer;
}
