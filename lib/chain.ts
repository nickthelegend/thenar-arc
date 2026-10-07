import { defineChain } from "viem";

import { DEPLOYMENT } from "./deployment";
import { LOCAL_DEPLOYMENT } from "./deployment-local";

/**
 * Monad testnet, where Thenar was first built at Monad Blitz Hyderabad.
 *
 * Four properties of this chain run through the product, and each one has a
 * place in the code that is shaped by it:
 *
 *  - 300 ms blocks, final two slots (about 600 ms) after they are proposed. A
 *    run executes in the time it takes the station to say it was sent, which
 *    is why the station reports two timers, executed and final
 *    (lib/receipt-timers.ts), and shows the live pipeline
 *    (components/monad-pipeline.tsx).
 *  - Parallel execution. AxonProtocolV2 shards its slot counter so that two
 *    operators on one task do not write the same storage slot.
 *  - The P256 precompile at 0x0100. A browser passkey authorises a run and the
 *    chain checks the secp256r1 signature itself; see /passkey.
 *  - Gas charged on the limit, not on what is used. Every submit's gas limit
 *    is estimated rather than padded, and the station says what it cost.
 *
 * One constraint shapes the reads: the public endpoints answer `eth_getLogs`
 * only a hundred blocks wide, under a minute of chain. So history is read from
 * contract storage, and a transaction hash is found with a one-block query at
 * the block the contract recorded — see lib/hooks.ts.
 */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/**
 * A local chain with Monad's shape, for running every flow end to end on one
 * machine: anvil with the Osaka hardfork, which has the same P-256 precompile
 * at 0x0100 that Monad has, the same contracts deployed by the same script,
 * and a USDC with Circle's EIP-3009 interface. scripts/localnet.mjs starts it.
 *
 * Chosen at build time with NEXT_PUBLIC_CHAIN=local. Transactions on it are
 * real transactions on a real chain; they are just not on Monad, and every
 * page of a local build carries a banner saying so (app/layout.tsx).
 */
export const LOCALNET = process.env.NEXT_PUBLIC_CHAIN === "local";

export const LOCAL_RPC = process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8645";

export const thenarLocalnet = defineChain({
  id: 31337,
  name: "Thenar Localnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC] } },
  // Nothing indexes a local chain for a block explorer, so the app has its
  // own: /explorer reads a transaction or an address straight off the node.
  blockExplorers: { default: { name: "Local explorer", url: "/explorer" } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** How copy names the chain in a sentence: "registered on Monad". */
export const CHAIN_SHORT = LOCALNET ? "the local chain" : "Monad";

/** The contracts this build reads and writes: Monad's, or the local chain's. */
export const ACTIVE_DEPLOYMENT = LOCALNET ? LOCAL_DEPLOYMENT : DEPLOYMENT;

/** Circle's USDC on Monad testnet, or its local stand-in. 6 decimals. What agents pay for the corpus in. */
export const USDC = (LOCALNET ? LOCAL_DEPLOYMENT.usdc : "0x534b2f3A21130d7a60830c2Df862319e593943A3") as `0x${string}`;

/** The one place the chain is named. Everything else reads it from here. */
export const appChain = LOCALNET ? thenarLocalnet : monadTestnet;

/**
 * Monad's RPCs, in the order reads try them.
 *
 * Each was probed for chain id and for batched calls before being written
 * down. The Foundation's own endpoint is first and is the one wallets are
 * given when they add the network; Ankr and thirdweb are there so a rate limit
 * on it costs latency instead of every figure on the site. drpc is not on the
 * list: it refuses the gas an eth_call through Multicall3 asks for.
 */
export const RPC_ENDPOINTS: readonly string[] = LOCALNET
  ? [LOCAL_RPC]
  : [
      monadTestnet.rpcUrls.default.http[0],
      "https://rpc.ankr.com/monad_testnet",
      "https://10143.rpc.thirdweb.com",
    ];

/** Where an operator with no gas is sent. On the local chain, its own faucet. */
export const FAUCET_URL = LOCALNET ? "/localnet" : "https://faucet.monad.xyz";

/** Where an agent with no USDC is sent. Circle's faucet has Monad testnet. */
export const USDC_FAUCET_URL = LOCALNET ? "/localnet" : "https://faucet.circle.com";

/** The ticker shown beside every amount. Hardcoding it is how a UI ends up
 *  quoting one chain's currency while settling in another's. */
export const CURRENCY = appChain.nativeCurrency.symbol;

const pick = (env: string | undefined, deployed: string) =>
  ((env && env.length ? env : deployed) ?? "") as `0x${string}`;

const C = ACTIVE_DEPLOYMENT.contracts;

/** Time-boxed read access to the corpus. Sells time, not rights: a
 *  subscription conveys no licence and no claim on any policy. */
export const CORPUS_ACCESS = pick(process.env.NEXT_PUBLIC_CORPUS_ACCESS, C.corpusAccess);

/** Certificates naming who recorded a run. Soulbound, and they convey nothing
 *  over the data they name. */
export const TRAJECTORY_CERTIFICATE = pick(process.env.NEXT_PUBLIC_TRAJECTORY_CERTIFICATE, C.trajectoryCertificate);

/**
 * Where a task's corpus contents are committed.
 *
 * The protocol holds each episode's hash one at a time, which proves every
 * episode is real and nothing about the set. This holds one hash over the
 * whole set, so a buyer can tell a complete corpus from a corpus with an
 * episode quietly missing.
 */
export const CORPUS_MANIFEST = pick(process.env.NEXT_PUBLIC_CORPUS_MANIFEST, C.corpusManifest);

/** The corpus as shares, held only by verified humans who drove the arm. */
export const CORPUS_SHARES = pick(process.env.NEXT_PUBLIC_CORPUS_SHARES, C.corpusShares);

/** Every corpus sale, with the sha256 of what was served, in storage and in events. */
export const SALES_LOG = pick(process.env.NEXT_PUBLIC_SALES_LOG, C.salesLog);

export const AXON_ADDRESS = pick(process.env.NEXT_PUBLIC_AXON_ADDRESS, C.axon);

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export const IS_DEPLOYED = isAddress(AXON_ADDRESS);

/** The block AxonProtocolV2 was deployed in. */
export const AXON_DEPLOY_BLOCK = BigInt(ACTIVE_DEPLOYMENT.deployBlock);

/**
 * Below this much MON a wallet cannot be relied on to pay for a submit.
 *
 * Monad charges the gas limit, not the gas used: a submit estimated at about
 * 400k and sent with that limit costs 0.04 MON at 100 gwei. This leaves room
 * for two. One number, used by every warning, so two banners cannot disagree
 * about whether the same balance is low.
 */
export const LOW_GAS_BALANCE = 0.1;

/** The registry that binds a secp256r1 key to an address. Public, so the client
 *  can read it without the server. */
export const PASSKEY_ADDRESS = pick(process.env.NEXT_PUBLIC_PASSKEY_REGISTRY, C.passkeyRegistry);

export const PASSKEY_DEPLOYED = isAddress(PASSKEY_ADDRESS);

export const txUrl = (hash: string) => `${appChain.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${appChain.blockExplorers.default.url}/address/${a}`;

/**
 * MonadVision (BlockVision), the testnet explorer that verifies contracts
 * through Sourcify, beside Monadscan. Monad testnet only: a local chain has no
 * explorer but its own (/explorer).
 */
export const MONADVISION = "https://testnet.monadvision.com";
export const monadVisionTx = (hash: string) => `${MONADVISION}/tx/${hash}`;
export const monadVisionAddress = (a: string) => `${MONADVISION}/address/${a}`;

/**
 * Chains this deployment has settled on before.
 *
 * Thenar was built on Monad, moved to Avalanche Fuji, and came back. Runs
 * recorded on Fuji came with it as stored records: their transaction hashes
 * are real, but they resolve on Fuji's explorer, not this one, so they are
 * shown separately rather than beside runs this contract knows about.
 */
export const PRIOR_CHAINS = [
  {
    id: 43113,
    name: "Avalanche Fuji",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    explorer: "https://testnet.snowtrace.io",
    currency: "AVAX",
  },
] as const;

/**
 * Contracts this protocol has settled on before the current one.
 *
 * A deployment can be superseded without moving chain. The Blitz contract is
 * on this same chain and still holds the runs recorded at Hyderabad; it is
 * simply not part of what the current contract knows about, and a feed that
 * mixed them would report a count the contract would deny.
 */
export const PRIOR_CONTRACTS = [
  {
    address: "0x89384f46e430F37DB61Afb98810eba995C0d6Ed4",
    chainId: 10143,
    label: "AxonProtocol v1 on Monad Testnet",
    why: "The Monad Blitz Hyderabad deployment. Superseded by v2, which can refund escrow, accept a relayed run, and verify a browser passkey.",
  },
  {
    address: "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0",
    chainId: 43113,
    label: "AxonProtocolV2 on Avalanche Fuji",
    why: "Where the product was built out between Blitz and the move back to Monad.",
  },
  {
    address: "0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3",
    chainId: 43113,
    label: "AxonProtocol v1 on Avalanche Fuji",
    why: "Superseded by v2 on Fuji.",
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

/**
 * The address that deployed the protocol and funded every task on it so far.
 *
 * Thenar has no third-party funders yet. Every task in the hub was posted by
 * this address to demonstrate the loop, and the product's own rule is that
 * anything shown before real traffic exists is labelled rather than left to
 * look like organic demand. Read off the chain, not asserted: compare a task's
 * funder to this and say so.
 */
export const SEED_FUNDER = (ACTIVE_DEPLOYMENT.deployer || "0xDf93bdA9B5de2fBf71C2201268DEFf54c1689815").toLowerCase();

export const isSeedFunded = (funder: string) => funder.toLowerCase() === SEED_FUNDER;

/**
 * What this is not, named where a visitor could assume otherwise.
 *
 * Principle 5 of PRODUCT.md: never dress roadmap as capability. These are the
 * things a person watching an arm move in a browser would reasonably assume
 * are there.
 */
export const NON_CAPABILITIES = [
  {
    title: "Kinematic, not rigid-body physics",
    body: "The station solves inverse kinematics and grasps analytically. There is no contact simulation, no friction, and no way for the payload to topple something else.",
  },
  {
    title: "No trained policy exists",
    body: "Nothing here autonomously attempts a task. A minted policy is a cap table over the trajectories that would train one, not a model that has been trained.",
  },
  {
    title: "No domain randomisation",
    body: "One lighting setup, one camera, one set of dimensions per object. No IsaacSim augmentation pipeline.",
  },
  {
    title: "No post-training takeover",
    body: "No DAgger loop, and no mobile ego-centric capture.",
  },
] as const;

/** Scenario vocabulary. The contract stores the index; this is the only place it is named. */
export const SCENARIOS = [
  "general", "kitchen", "office", "bathroom", "workshop", "home", "play",
] as const;

export const scenarioName = (i: number) => SCENARIOS[i] ?? "general";
