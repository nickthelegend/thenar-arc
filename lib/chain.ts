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

/**
 * Where to ask, in the order to ask.
 *
 * Not interchangeable, and the order is the point. The first answers a
 * million-block `getLogs` in one call, which is how this app reads its own
 * history; the others refuse anything much above fifty thousand and ten
 * thousand blocks respectively. They are here so that a rate limit or an outage
 * on the first costs latency instead of every figure on the site, and
 * lib/scan-logs.ts is what makes a narrower endpoint a slower answer rather
 * than a wrong one.
 *
 * Measured rather than assumed: each was probed for chain id, head, and the
 * widest log range it would accept before being written down.
 */
export const RPC_ENDPOINTS = [
  avalancheFuji.rpcUrls.default.http[0],
  "https://avalanche-fuji-c-chain-rpc.publicnode.com",
  "https://avalanche-fuji.drpc.org",
] as const;

/** Where an operator with no gas is sent. Chain-scoped for the same reason the
 *  explorer is: the app shipped pointing at another chain's faucet. */
export const FAUCET_URL = "https://core.app/tools/testnet-faucet/?subnet=c&token=c";

/** The ticker shown beside every amount. Hardcoding it is how a UI ends up
 *  quoting one chain's currency while settling in another's. */
export const CURRENCY = appChain.nativeCurrency.symbol;

/** Time-boxed read access to the corpus. Sells time, not rights: a
 *  subscription conveys no licence and no claim on any policy. */
export const CORPUS_ACCESS = (process.env.NEXT_PUBLIC_CORPUS_ACCESS ?? "") as `0x${string}`;

/** Certificates naming who recorded a run. Soulbound, and they convey nothing
 *  over the data they name. */
export const TRAJECTORY_CERTIFICATE =
  (process.env.NEXT_PUBLIC_TRAJECTORY_CERTIFICATE ?? "") as `0x${string}`;

/**
 * Where a task's corpus contents are committed.
 *
 * The protocol holds each episode's hash one at a time, which proves every
 * episode is real and nothing about the set. This holds one hash over the
 * whole set, so a buyer can tell a complete corpus from a corpus with an
 * episode quietly missing.
 */
export const CORPUS_MANIFEST =
  (process.env.NEXT_PUBLIC_CORPUS_MANIFEST
    ?? "0x318e5faf04c9db5d844aaa93850e71406012dd62") as `0x${string}`;

export const AXON_ADDRESS = (process.env.NEXT_PUBLIC_AXON_ADDRESS ?? "") as `0x${string}`;

export const IS_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(AXON_ADDRESS);

/** The registry that binds a secp256r1 key to an address. Public, so the client
 *  can read it without the server. */
export const PASSKEY_ADDRESS =
  (process.env.NEXT_PUBLIC_PASSKEY_REGISTRY ?? "0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F") as `0x${string}`;

export const PASSKEY_DEPLOYED = /^0x[0-9a-fA-F]{40}$/.test(PASSKEY_ADDRESS);

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

/**
 * Contracts this protocol has settled on before the current one.
 *
 * A deployment can be superseded without moving chain — v2 added escrow
 * refunds, relayed submission and a passkey digest that works, none of which
 * an already-deployed contract can grow. The runs settled against the earlier
 * one are still real, still paid, and still verifiable against it; they are
 * simply not part of what the current contract knows about, and a feed that
 * mixed them would report a count the contract would deny.
 *
 * So they are archived rather than dropped, exactly as the move off Monad was.
 */
export const PRIOR_CONTRACTS = [
  {
    address: "0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3",
    chainId: 43113,
    label: "AxonProtocol v1 on Avalanche Fuji",
    why: "Superseded by v2, which can refund escrow, accept a relayed run, and verify a browser passkey.",
  },
  {
    address: "0x89384f46e430F37DB61Afb98810eba995C0d6Ed4",
    chainId: 10143,
    label: "AxonProtocol on Monad Testnet",
    why: "The deployment this project was built on before moving to Avalanche.",
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
export const SEED_FUNDER = "0xDf93bdA9B5de2fBf71C2201268DEFf54c1689815".toLowerCase();

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
