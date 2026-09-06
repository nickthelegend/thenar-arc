import { defineChain } from "viem";

export const avalancheFuji = defineChain({
  id: 43113,
  name: "Avalanche Fuji",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] } },
  blockExplorers: {
    default: { name: "Snowtrace", url: "https://testnet.snowtrace.io" },
  },
  contracts: {
    // Fuji carries Multicall3 at the canonical address. Declaring it is what
    // lets a screen full of reads collapse into a single eth_call: without it
    // every trajectory was a separate request, and the public RPC's rate cap
    // silently dropped some of them on every poll. The block is the one the
    // contract actually first appears at, found by bisecting eth_getCode —
    // a number that is too high makes viem refuse to batch at all.
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 7096959,
    },
  },
  testnet: true,
});

/** The one place the chain is named. Everything else reads it from here. */
export const appChain = avalancheFuji;

/** Where an operator with no gas is sent. Chain-scoped for the same reason the
 *  explorer is: the app shipped pointing at another chain's faucet. */
export const FAUCET_URL = "https://core.app/tools/testnet-faucet/?subnet=c&token=c";

/** The ticker shown beside every amount. Hardcoding it is how a UI ends up
 *  quoting one chain's currency while settling in another's. */
export const CURRENCY = appChain.nativeCurrency.symbol;

export const AXON_ADDRESS = (process.env.NEXT_PUBLIC_AXON_ADDRESS ?? "") as `0x${string}`;

export const IS_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(AXON_ADDRESS);

export const txUrl = (hash: string) => `${appChain.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${appChain.blockExplorers.default.url}/address/${a}`;

/**
 * Chains this deployment has settled on before.
 *
 * The app moved from Monad to Avalanche, and the runs recorded under the old
 * deployment came with it. Their transaction hashes are real, but they resolve
 * on the old explorer, not this one — rendering them beside current runs put
 * "verify" links on the page that led to transactions Fuji has never heard of.
 * They are kept and shown separately rather than deleted, because the runs did
 * happen and the contributors were really paid.
 */
export const PRIOR_CHAINS = [
  {
    id: 10143,
    name: "Monad Testnet",
    rpc: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadexplorer.com",
    currency: "MON",
  },
] as const;

/** Every chain a stored run could legitimately belong to. */
export const KNOWN_CHAINS = [
  { id: appChain.id, name: appChain.name, rpc: appChain.rpcUrls.default.http[0],
    explorer: appChain.blockExplorers.default.url, currency: appChain.nativeCurrency.symbol },
  ...PRIOR_CHAINS,
] as const;

export const chainMeta = (id: number) => KNOWN_CHAINS.find((c) => c.id === id);

/** An explorer link that points at the chain the transaction is actually on. */
export const txUrlOn = (chainId: number, hash: string) =>
  `${chainMeta(chainId)?.explorer ?? appChain.blockExplorers.default.url}/tx/${hash}`;

/** Scenario vocabulary. The contract stores the index; this is the only place it is named. */
export const SCENARIOS = [
  "general", "kitchen", "office", "bathroom", "workshop", "home", "play",
] as const;

export const scenarioName = (i: number) => SCENARIOS[i] ?? "general";
