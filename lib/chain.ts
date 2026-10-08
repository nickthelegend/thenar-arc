import { defineChain } from "viem";

import { MAINNET_DEPLOYMENT, TESTNET_DEPLOYMENT, type Deployment } from "./deployment";

/**
 * Arc, Circle's stablecoin-native L1, where Thenar runs.
 *
 * Three properties of Arc run through the product, and each has a place in
 * the code shaped by it:
 *
 *  - USDC is the gas. An operator, a sponsor and a buying agent each hold one
 *    token, the same dollars they are paid or pay in. The native balance is
 *    USDC at 18 decimals; the ERC-20 at 0x3600…0000 is the same balance at 6.
 *    Contract amounts (escrow, payouts, licences) are always the ERC-20's 6.
 *  - Deterministic sub-second finality. A run is paid in the block that
 *    records it and that block is final when it is produced; there is no
 *    "wait for confirmations" anywhere in the UI.
 *  - The P-256 precompile at 0x0100. A browser passkey authorises a run and
 *    the chain checks the secp256r1 signature itself; see /passkey.
 *
 * Which Arc is chosen at build time with NEXT_PUBLIC_ARC_NETWORK:
 *  - `testnet` (default): Arc testnet, chain 5042002;
 *  - `mainnet`: Arc mainnet, chain 5042;
 *  - `fork`: a local fork of Arc testnet made by Circle's Arc Foundry
 *    (scripts/arc-fork.mjs), with the real USDC, CCTP, Gateway, Memo, ERC-8004
 *    and CCIP contracts and Thenar deployed on it. Every page of a fork build
 *    says so (app/layout.tsx).
 */
export type ArcNetwork = "testnet" | "mainnet" | "fork";

const RAW_NETWORK = (process.env.NEXT_PUBLIC_ARC_NETWORK ?? "testnet").toLowerCase();
export const ARC_NETWORK: ArcNetwork = RAW_NETWORK === "mainnet" ? "mainnet" : RAW_NETWORK === "fork" ? "fork" : "testnet";

/** A local Arc fork. Named LOCALNET because every "this is not the public chain" branch already reads it. */
export const LOCALNET = ARC_NETWORK === "fork";
export const ARC_FORK = LOCALNET;
export const IS_MAINNET = ARC_NETWORK === "mainnet";

export const LOCAL_RPC = process.env.NEXT_PUBLIC_FORK_RPC || process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:9000";

const MULTICALL3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const };

/** Native USDC is 18 decimals for gas; the ERC-20 interface reports the same balance at 6. */
const NATIVE_USDC = { name: "USDC", symbol: "USDC", decimals: 18 } as const;

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  contracts: { multicall3: MULTICALL3 },
  testnet: true,
});

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: { multicall3: MULTICALL3 },
});

/**
 * The fork keeps Arc testnet's chain id, so a wallet signs for 5042002 and
 * Circle's USDC domain separator matches. Nothing indexes it, so the app's own
 * /explorer reads transactions and addresses straight off the node.
 */
export const thenarLocalnet = defineChain({
  id: 5042002,
  name: "Arc Testnet (local fork)",
  nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: [LOCAL_RPC] } },
  blockExplorers: { default: { name: "Local explorer", url: "/explorer" } },
  contracts: { multicall3: MULTICALL3 },
  testnet: true,
});

/** The one place the chain is named. Everything else reads it from here. */
export const appChain = LOCALNET ? thenarLocalnet : IS_MAINNET ? arcMainnet : arcTestnet;

/** How copy names the chain in a sentence: "registered on Arc". */
export const CHAIN_SHORT = LOCALNET ? "the Arc fork" : "Arc";

/** The fork's deployment, written by scripts/arc-fork.mjs into .env.fork as one JSON value. */
function forkDeployment(): Deployment {
  const raw = process.env.NEXT_PUBLIC_ARC_DEPLOYMENT;
  if (!raw) return TESTNET_DEPLOYMENT;
  try {
    return JSON.parse(raw) as Deployment;
  } catch {
    return TESTNET_DEPLOYMENT;
  }
}

/** The contracts this build reads and writes. */
export const ACTIVE_DEPLOYMENT: Deployment = LOCALNET ? forkDeployment() : IS_MAINNET ? MAINNET_DEPLOYMENT : TESTNET_DEPLOYMENT;

const X = ACTIVE_DEPLOYMENT.external;

/** Circle's USDC on Arc: the ERC-20 view of the native balance, 6 decimals. Same address on testnet and mainnet. */
export const USDC = (X.usdc || "0x3600000000000000000000000000000000000000") as `0x${string}`;
export const USDC_DECIMALS = 6;

/**
 * Arc's RPCs, in the order reads try them. A fork has only itself.
 */
export const RPC_ENDPOINTS: readonly string[] = LOCALNET
  ? [LOCAL_RPC]
  : IS_MAINNET
    ? [process.env.NEXT_PUBLIC_ARC_RPC || arcMainnet.rpcUrls.default.http[0]]
    : [process.env.NEXT_PUBLIC_ARC_RPC || arcTestnet.rpcUrls.default.http[0]];

/** Where a wallet with no USDC is sent: Circle's faucet has Arc testnet. On the fork, its own faucet. */
export const FAUCET_URL = LOCALNET ? "/localnet" : IS_MAINNET ? "https://www.circle.com/usdc" : "https://faucet.circle.com";
export const USDC_FAUCET_URL = FAUCET_URL;

/** The ticker beside every amount. Gas, bounties, payouts and agents' payments are all USDC. */
export const CURRENCY = "USDC";

const pick = (env: string | undefined, deployed: string | undefined) =>
  ((env && env.length ? env : deployed) ?? "") as `0x${string}`;

const C = ACTIVE_DEPLOYMENT.contracts;

/** Certificates naming who recorded a run. Soulbound. */
export const TRAJECTORY_CERTIFICATE = pick(process.env.NEXT_PUBLIC_TRAJECTORY_CERTIFICATE, C.trajectoryCertificate);

/** Where a task's corpus contents are committed: one Merkle root per task. */
export const CORPUS_MANIFEST = pick(process.env.NEXT_PUBLIC_CORPUS_MANIFEST, C.corpusManifest);

/** The corpus as shares, held only by verified humans who drove the arm; dividends in USDC. */
export const CORPUS_SHARES = pick(process.env.NEXT_PUBLIC_CORPUS_SHARES, C.corpusShares);

/** Every corpus sale, with the sha256 of what was served and the buyer's ERC-8004 agent id. */
export const SALES_LOG = pick(process.env.NEXT_PUBLIC_SALES_LOG, C.salesLog);

/** The keeper-written audit of each served corpus against its committed root. */
export const CORPUS_AUDIT = pick(process.env.NEXT_PUBLIC_CORPUS_AUDIT, C.corpusAudit);

/** ThenarProtocol: tasks, USDC escrow, runs and payouts, licences. */
export const PROTOCOL_ADDRESS = pick(process.env.NEXT_PUBLIC_PROTOCOL_ADDRESS, C.protocol);
/** The same address under the name most of the app already reads. */
export const AXON_ADDRESS = PROTOCOL_ADDRESS;

/** ThenarVerdicts: the verifier's ERC-8004 record of paid verdicts. */
export const VERDICTS_ADDRESS = pick(process.env.NEXT_PUBLIC_VERDICTS_ADDRESS, C.verdicts);

/** ThenarCcipReceiver: corpus licences bought from Base / Ethereum over CCIP + CCTP. */
export const CCIP_RECEIVER = pick(process.env.NEXT_PUBLIC_CCIP_RECEIVER, C.ccipReceiver);

export const ContributionRecordAddress = pick(undefined, C.contributionRecord);

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export const IS_DEPLOYED = isAddress(AXON_ADDRESS);

/** The block ThenarProtocol was deployed in. */
export const AXON_DEPLOY_BLOCK = BigInt(ACTIVE_DEPLOYMENT.deployBlock || 0);

/**
 * Below this much USDC a wallet cannot be relied on to pay for a submit.
 * A submit uses about 600k gas, around 0.015 USDC at Arc testnet's fees; this leaves room for a few.
 */
export const LOW_GAS_BALANCE = 0.05;

/** The registry that binds a secp256r1 key to an address. */
export const PASSKEY_ADDRESS = pick(process.env.NEXT_PUBLIC_PASSKEY_REGISTRY, C.passkeyRegistry);
export const PASSKEY_DEPLOYED = isAddress(PASSKEY_ADDRESS);

/** Circle and Chainlink contracts on this Arc, from deployments/arc-<network>.json. */
export const ARC_EXTERNAL = {
  usdc: USDC,
  memo: (X.memo || "0x5294E9927c3306DcBaDb03fe70b92e01cCede505") as `0x${string}`,
  identityRegistry: X.erc8004IdentityRegistry as `0x${string}`,
  reputationRegistry: X.erc8004ReputationRegistry as `0x${string}`,
  validationRegistry: X.erc8004ValidationRegistry as `0x${string}`,
  ccipRouter: X.ccipRouter as `0x${string}`,
  ccipChainSelector: X.ccipChainSelector,
  tokenMessengerV2: X.cctpTokenMessengerV2 as `0x${string}`,
  messageTransmitterV2: X.cctpMessageTransmitterV2 as `0x${string}`,
  cctpDomain: Number(X.cctpDomain ?? 26),
  gatewayWallet: X.gatewayWallet as `0x${string}`,
  gatewayMinter: X.gatewayMinter as `0x${string}`,
} as const;

export const txUrl = (hash: string) => `${appChain.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${appChain.blockExplorers.default.url}/address/${a}`;

/**
 * Chains Thenar has settled on before. None of their runs live in this
 * deployment's storage; listed so a stored record that names one resolves on
 * the right explorer.
 */
export const PRIOR_CHAINS: readonly { id: number; name: string; rpc: string; explorer: string; currency: string }[] = [];

/**
 * Deployments this one supersedes. The ETHOnline 2026 build ran on Arc testnet
 * too, with native-value escrow; this one escrows the USDC ERC-20 and adds the
 * Arc stack (x402, ERC-8004, Gateway, CCTP, CCIP, Memo).
 */
export const PRIOR_CONTRACTS = [
  {
    address: "0x6D6D6D0ee86C654b69646223049D6812c0218B2f",
    chainId: 5042002,
    label: "AxonProtocolV2 on Arc Testnet (ETHOnline 2026)",
    why: "The earlier Thenar-on-Arc build. Superseded by ThenarProtocol, which escrows Circle's USDC ERC-20 and reports every paid verdict to ERC-8004.",
  },
] as const;

/** Every chain a stored run could legitimately belong to. */
export const KNOWN_CHAINS = [
  { id: appChain.id, name: appChain.name, rpc: appChain.rpcUrls.default.http[0],
    explorer: appChain.blockExplorers.default.url, currency: CURRENCY },
  ...PRIOR_CHAINS,
] as const;

export const chainMeta = (id: number) => KNOWN_CHAINS.find((c) => c.id === id);

/** An explorer link that points at the chain the transaction is actually on. */
export const txUrlOn = (chainId: number, hash: string) =>
  `${chainMeta(chainId)?.explorer ?? appChain.blockExplorers.default.url}/tx/${hash}`;

/**
 * The address that deployed the protocol and funded the seed tasks. Tasks it
 * posted are labelled as seed bounties rather than left to look like demand.
 */
export const SEED_FUNDER = (ACTIVE_DEPLOYMENT.deployer || "0x0648aDF1967692A0c991d7715b0b588452321FBd").toLowerCase();

export const isSeedFunded = (funder: string) => funder.toLowerCase() === SEED_FUNDER;

/**
 * What this is not, named where a visitor could assume otherwise.
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
