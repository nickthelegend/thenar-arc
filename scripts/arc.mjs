/**
 * Arc for scripts, and the env files they read.
 *
 * Every script imports this, so the chain a script talks to is the chain the
 * app talks to (NEXT_PUBLIC_ARC_NETWORK: testnet, mainnet or fork).
 *
 * Addresses come from lib/deployment.ts (written by scripts/apply-deploy.mjs
 * from deployments/arc-<network>.json), or on the fork from .env.fork
 * (NEXT_PUBLIC_ARC_DEPLOYMENT, written by scripts/arc-fork.mjs). Any can be
 * overridden by its NEXT_PUBLIC_* env.
 */
import { existsSync, readFileSync } from "node:fs";
import { defineChain, fallback, http } from "viem";
import { MAINNET_DEPLOYMENT, TESTNET_DEPLOYMENT } from "../lib/deployment.ts";

/** KEY=value lines from a file, or {} if it is not there. */
export function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
  );
}

const NETWORK_RAW = (process.env.NEXT_PUBLIC_ARC_NETWORK ?? readEnvFile(".env.local").NEXT_PUBLIC_ARC_NETWORK ?? "testnet").toLowerCase();
export const NETWORK = NETWORK_RAW === "mainnet" ? "mainnet" : NETWORK_RAW === "fork" ? "fork" : "testnet";
export const LOCALNET = NETWORK === "fork";

// The fork's keys are throwaway keys made by scripts/arc-fork.mjs, and they must win over .env.local.
const files = LOCALNET ? { ...readEnvFile(".env.local"), ...readEnvFile(".env.fork") } : readEnvFile(".env.local");

/** process.env first, then .env.fork (fork) / .env.local. */
export const env = (name) => process.env[name] || files[name] || undefined;

export const LOCAL_RPC = env("NEXT_PUBLIC_FORK_RPC") || "http://127.0.0.1:9000";
const LOCAL_APP = env("LOCAL_APP_URL") || "http://localhost:9010";

const NATIVE_USDC = { name: "USDC", symbol: "USDC", decimals: 18 };
const MULTICALL3 = { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } };

export const arcTestnet = defineChain({
  id: 5042002, name: "Arc Testnet", nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: [env("NEXT_PUBLIC_ARC_RPC") || "https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  contracts: MULTICALL3, testnet: true,
});
export const arcMainnet = defineChain({
  id: 5042, name: "Arc", nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: [env("NEXT_PUBLIC_ARC_RPC") || "https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: MULTICALL3,
});
export const arcFork = defineChain({
  id: 5042002, name: "Arc Testnet (local fork)", nativeCurrency: NATIVE_USDC,
  rpcUrls: { default: { http: [LOCAL_RPC] } },
  blockExplorers: { default: { name: "Local explorer", url: `${LOCAL_APP}/explorer` } },
  contracts: MULTICALL3, testnet: true,
});

/** The chain scripts talk to: the one the app talks to. */
export const appChain = LOCALNET ? arcFork : NETWORK === "mainnet" ? arcMainnet : arcTestnet;
export const RPC_ENDPOINTS = [appChain.rpcUrls.default.http[0]];
export const transport = () =>
  fallback(RPC_ENDPOINTS.map((url) => http(url, { retryCount: 1, timeout: 30_000 })), { rank: false });

export const EXPLORER = appChain.blockExplorers.default.url;
export const txUrl = (h) => `${EXPLORER}/tx/${h}`;
export const addressUrl = (a) => `${EXPLORER}/address/${a}`;

function forkDeployment() {
  const raw = env("NEXT_PUBLIC_ARC_DEPLOYMENT");
  if (!raw) return TESTNET_DEPLOYMENT;
  try { return JSON.parse(raw); } catch { return TESTNET_DEPLOYMENT; }
}
export const DEPLOYMENT = LOCALNET ? forkDeployment() : NETWORK === "mainnet" ? MAINNET_DEPLOYMENT : TESTNET_DEPLOYMENT;
const C = DEPLOYMENT.contracts;
const X = DEPLOYMENT.external;
const pick = (name, deployed) => env(name) || deployed || undefined;

/** The deployment's addresses, as the app sees them. */
export const ADDR = {
  axon: pick("NEXT_PUBLIC_PROTOCOL_ADDRESS", C.protocol),
  protocol: pick("NEXT_PUBLIC_PROTOCOL_ADDRESS", C.protocol),
  verdicts: pick("NEXT_PUBLIC_VERDICTS_ADDRESS", C.verdicts),
  passkeys: pick("NEXT_PUBLIC_PASSKEY_REGISTRY", C.passkeyRegistry),
  certificate: pick("NEXT_PUBLIC_TRAJECTORY_CERTIFICATE", C.trajectoryCertificate),
  contribution: C.contributionRecord || undefined,
  corpusManifest: pick("NEXT_PUBLIC_CORPUS_MANIFEST", C.corpusManifest),
  corpusShares: pick("NEXT_PUBLIC_CORPUS_SHARES", C.corpusShares),
  salesLog: pick("NEXT_PUBLIC_SALES_LOG", C.salesLog),
  corpusAudit: pick("NEXT_PUBLIC_CORPUS_AUDIT", C.corpusAudit),
  ccipReceiver: pick("NEXT_PUBLIC_CCIP_RECEIVER", C.ccipReceiver),
};

/** Circle's and Chainlink's contracts on this Arc. */
export const ARC = {
  usdc: X.usdc || "0x3600000000000000000000000000000000000000",
  memo: X.memo || "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  identityRegistry: X.erc8004IdentityRegistry,
  reputationRegistry: X.erc8004ReputationRegistry,
  ccipRouter: X.ccipRouter,
  ccipChainSelector: X.ccipChainSelector,
  tokenMessengerV2: X.cctpTokenMessengerV2,
  messageTransmitterV2: X.cctpMessageTransmitterV2,
  gatewayWallet: X.gatewayWallet,
  gatewayMinter: X.gatewayMinter,
};

export const DEPLOY_BLOCK = BigInt(DEPLOYMENT.deployBlock || 0);

export function need(value, what) {
  if (!value) {
    console.error(`  ${what} is not set.`);
    process.exit(1);
  }
  return value;
}
