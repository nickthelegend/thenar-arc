/**
 * The terms on which an agent can take a task's corpus without a subscription.
 *
 * A CorpusAccess subscription on Arc is a wallet buying a day. That fits a
 * person with a browser and fits an agent badly: an agent wants one task's
 * file, now, paid for in the request that fetches it. So the same file is also
 * sold per pull over x402, settled on Hedera, and an agent that can show a
 * verified human behind it in World's AgentBook gets its first pulls free.
 *
 * Shared by the route that enforces these terms and the pages that state them,
 * so the price on the page is the price the server asks for.
 */
export const AGENT_CORPUS = {
  path: "/api/agent/corpus",
  network: "hedera:testnet",
  /** HBAR. On Hedera the native asset's id is 0.0.0. */
  asset: "0.0.0",
  /** Tinybars: half an HBAR per task corpus. */
  amount: "50000000",
  decimals: 8,
  /** Blocky402's public testnet facilitator. It pays the Hedera fee; no key. */
  facilitator: "https://api.testnet.blocky402.com",
  /** Free pulls per verified human, counted across every task. */
  freeUses: 3,
  /** Where AgentBook lives. The agent signs for this chain; the lookup reads it. */
  agentBook: {
    network: "eip155:480",
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
  },
  /** The wallet scripts/agent-buy.mjs signs with. Its Hedera account uses the same key. */
  demoAgent: "0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA",
  mirror: "https://testnet.mirrornode.hedera.com",
  hashscan: "https://hashscan.io/testnet",
} as const;

export const agentCorpusPrice = () =>
  `${Number(AGENT_CORPUS.amount) / 10 ** AGENT_CORPUS.decimals} HBAR`;

/** Hashscan wants `0.0.x-seconds-nanos` where the SDK writes `0.0.x@seconds.nanos`. */
export function hashscanTx(id: string): string {
  const m = id.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  return `${AGENT_CORPUS.hashscan}/transaction/${m ? `${m[1]}-${m[2]}-${m[3]}` : id}`;
}
