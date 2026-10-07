/**
 * The terms on which an agent can take a task's corpus without a subscription.
 *
 * A CorpusAccess subscription is a wallet buying a day. That fits a person with
 * a browser and fits an agent badly: an agent wants one task's file, now, paid
 * for in the request that fetches it. So the same file is also sold per pull
 * over x402, in USDC on Monad.
 *
 * Monad is what makes a one-cent sale sensible: the agent signs an EIP-3009
 * authorisation, the facilitator submits it and pays the gas, and the transfer
 * executes in the next 300 ms block and is final two slots later: under a
 * second after the request.
 *
 * Shared by the route that enforces these terms and the pages that state them,
 * so the price on the page is the price the server asks for.
 *
 * One import, of a file with none: scripts/agent-buy.mjs loads this with Node.
 *
 * On the local chain (NEXT_PUBLIC_CHAIN=local) the same terms hold on chain
 * 31337: the local USDC scripts/localnet.mjs deployed, and the facilitator
 * scripts/x402-facilitator.mjs runs beside it.
 */
import { LOCAL_DEPLOYMENT } from "./deployment-local";

const LOCAL = process.env.NEXT_PUBLIC_CHAIN === "local";

export const AGENT_CORPUS = {
  path: "/api/agent/corpus",
  network: LOCAL ? "eip155:31337" : "eip155:10143",
  /** Circle's USDC on Monad testnet, or the local chain's. */
  asset: LOCAL ? LOCAL_DEPLOYMENT.usdc : "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  /** The token's EIP-712 domain, which the agent signs the authorisation under. */
  assetDomain: { name: "USDC", version: "2" },
  /** Atomic units: one cent of USDC per task corpus. */
  amount: "10000",
  decimals: 6,
  symbol: "USDC",
  /** The Monad Foundation's public facilitator. It pays the gas; no key. */
  facilitator: LOCAL
    ? (process.env.X402_FACILITATOR_URL ?? "http://127.0.0.1:4021")
    : "https://x402-facilitator.molandak.org",
  /** The wallet scripts/agent-buy.mjs signs with. */
  demoAgent: "0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA",
  explorer: LOCAL ? "/explorer" : "https://testnet.monadscan.com",
} as const;

export const agentCorpusPrice = () =>
  `${Number(AGENT_CORPUS.amount) / 10 ** AGENT_CORPUS.decimals} ${AGENT_CORPUS.symbol}`;

export const explorerTx = (hash: string) => `${AGENT_CORPUS.explorer}/tx/${hash}`;
export const explorerAddress = (a: string) => `${AGENT_CORPUS.explorer}/address/${a}`;
