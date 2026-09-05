import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export const AXON_ADDRESS = (process.env.NEXT_PUBLIC_AXON_ADDRESS ?? "") as `0x${string}`;
export const IS_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(AXON_ADDRESS);

export const txUrl = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${monadTestnet.blockExplorers.default.url}/address/${a}`;

/** Scenario vocabulary. The contract stores the index; this is the only place it is named. */
export const SCENARIOS = [
  "general", "kitchen", "office", "bathroom", "workshop", "home", "play",
] as const;

export const scenarioName = (i: number) => SCENARIOS[i] ?? "general";
