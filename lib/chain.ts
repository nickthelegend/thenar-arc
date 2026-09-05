import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadscan.com" },
  },
  contracts: {
    // Monad testnet carries Multicall3 at the canonical address. Declaring it
    // is what lets a screen full of reads collapse into a single eth_call:
    // without it every trajectory was a separate request, and the public RPC's
    // 15/sec cap silently dropped some of them on every poll.
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 251449,
    },
  },
  testnet: true,
});

export const AXON_ADDRESS = (process.env.NEXT_PUBLIC_AXON_ADDRESS ?? "") as `0x${string}`;

/** PasskeyRegistry — secp256r1 verification through Monad's P256 precompile. */
export const PASSKEY_ADDRESS = "0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165" as const;
/** EIP-7951. Present on Monad, absent from Ethereum mainnet. */
export const P256_PRECOMPILE = "0x0000000000000000000000000000000000000100" as const;
export const IS_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(AXON_ADDRESS);

export const txUrl = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${monadTestnet.blockExplorers.default.url}/address/${a}`;

/** Scenario vocabulary. The contract stores the index; this is the only place it is named. */
export const SCENARIOS = [
  "general", "kitchen", "office", "bathroom", "workshop", "home", "play",
] as const;

export const scenarioName = (i: number) => SCENARIOS[i] ?? "general";
