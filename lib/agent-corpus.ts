/**
 * The terms on which an agent takes a task's corpus: per request, over x402,
 * in USDC on Arc.
 *
 * An agent wants one task's file, now, paid for in the request that fetches
 * it. The agent signs an EIP-3009 `transferWithAuthorization` for a cent of
 * Circle's USDC; Thenar's own in-process facilitator
 * (lib/server/x402-facilitator.ts) submits it and pays the gas — in USDC,
 * because on Arc the gas token is USDC — and Arc's deterministic finality
 * makes the transfer final in the block that includes it, under a second
 * after the request. There is no public x402 facilitator on Arc, so Thenar
 * runs its own; the resource server cannot tell the difference.
 *
 * Shared by the route that enforces these terms and the pages that state them,
 * so the price on the page is the price the server asks for.
 *
 * Imports only lib/chain.ts: scripts/agent-buy.mjs loads this with Node.
 */
import { appChain, USDC } from "./chain";

export const AGENT_CORPUS = {
  path: "/api/agent/corpus",
  /** CAIP-2: Arc testnet (5042002, also the fork) or Arc mainnet (5042). */
  network: `eip155:${appChain.id}` as `${string}:${string}`,
  /** Circle's USDC on Arc: the ERC-20 view of the gas token, 6 decimals. */
  asset: USDC,
  /** The token's EIP-712 domain, which the agent signs the authorisation under. */
  assetDomain: { name: "USDC", version: "2" },
  /** Atomic units: one cent of USDC per task corpus. */
  amount: "10000",
  decimals: 6,
  symbol: "USDC",
  /** Thenar settles x402 itself: no external facilitator URL. */
  facilitator: "in-process" as const,
  /** Request header naming the buyer's ERC-8004 agent id; SalesLog records it when the payer is that agent's wallet or owner. */
  agentHeader: "x-erc8004-agent-id",
  /** An agent wallet the /agents page shows by default (NEXT_PUBLIC_DEMO_AGENT), or empty. */
  demoAgent: process.env.NEXT_PUBLIC_DEMO_AGENT ?? "",
  explorer: appChain.blockExplorers.default.url,
} as const;

export const agentCorpusPrice = () =>
  `${Number(AGENT_CORPUS.amount) / 10 ** AGENT_CORPUS.decimals} ${AGENT_CORPUS.symbol}`;

export const explorerTx = (hash: string) => `${AGENT_CORPUS.explorer}/tx/${hash}`;
export const explorerAddress = (a: string) => `${AGENT_CORPUS.explorer}/address/${a}`;
