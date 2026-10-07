/**
 * Monad testnet for scripts, and the env files they read.
 *
 * Every script used to define its own chain inline, which is how half of them
 * were still pointed at Fuji after the app had moved to Arc. They import this
 * instead, so the chain a script talks to is the chain the app talks to.
 *
 * The deployment's addresses come from lib/deployment.ts, which
 * scripts/apply-deploy.mjs writes from forge's broadcast record, with
 * .env.local allowed to override any of them.
 *
 * With NEXT_PUBLIC_CHAIN=local, the same holds for the local chain: its
 * addresses from lib/deployment-local.ts, its env from .env.localnet, both
 * written by scripts/localnet.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { defineChain, fallback, http } from "viem";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monadscan", url: "https://testnet.monadscan.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const LOCALNET = process.env.NEXT_PUBLIC_CHAIN === "local";
export const LOCAL_RPC = process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8645";
/** Where the local app serves its explorer, for the links scripts print. */
const LOCAL_APP = process.env.LOCAL_APP_URL || "http://localhost:3336";

export const thenarLocalnet = defineChain({
  id: 31337,
  name: "Thenar Localnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC] } },
  blockExplorers: { default: { name: "Local explorer", url: `${LOCAL_APP}/explorer` } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

/** The chain scripts talk to: the one the app talks to. */
export const appChain = LOCALNET ? thenarLocalnet : monadTestnet;

export const RPC_ENDPOINTS = LOCALNET
  ? [LOCAL_RPC]
  : [
      "https://testnet-rpc.monad.xyz",
      "https://rpc.ankr.com/monad_testnet",
      "https://10143.rpc.thirdweb.com",
    ];

export const transport = () =>
  fallback(RPC_ENDPOINTS.map((url) => http(url, { retryCount: 1, timeout: 30_000 })), { rank: false });

export const EXPLORER = appChain.blockExplorers.default.url;
export const txUrl = (h) => `${EXPLORER}/tx/${h}`;
export const addressUrl = (a) => `${EXPLORER}/address/${a}`;

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

// The local chain's keys are anvil's well-known test accounts, and they must
// win over .env.local, which names Monad's.
const files = LOCALNET
  ? readEnvFile(".env.localnet")
  : { ...readEnvFile(".env.deployer"), ...readEnvFile(".env.local") };

/** process.env first, then .env.local, then .env.deployer (or .env.localnet alone). */
export const env = (name) => process.env[name] || files[name] || undefined;

const D = LOCALNET ? LOCAL_DEPLOYMENT : DEPLOYMENT;
const C = D.contracts;
const pick = (name, deployed) => env(name) || deployed || undefined;

/** The deployment's addresses, as the app sees them. */
export const ADDR = {
  axon: pick("NEXT_PUBLIC_AXON_ADDRESS", C.axon),
  passkeys: pick("NEXT_PUBLIC_PASSKEY_REGISTRY", C.passkeyRegistry),
  certificate: pick("NEXT_PUBLIC_TRAJECTORY_CERTIFICATE", C.trajectoryCertificate),
  contribution: C.contributionRecord || undefined,
  corpusAccess: pick("NEXT_PUBLIC_CORPUS_ACCESS", C.corpusAccess),
  corpusManifest: pick("NEXT_PUBLIC_CORPUS_MANIFEST", C.corpusManifest),
  corpusShares: pick("NEXT_PUBLIC_CORPUS_SHARES", C.corpusShares),
  salesLog: pick("NEXT_PUBLIC_SALES_LOG", C.salesLog),
  referrals: C.referrals || undefined,
  foundry: C.foundry || undefined,
  prizePool: C.prizePool || undefined,
  confidentialPayouts: C.confidentialPayouts || undefined,
};

export const DEPLOY_BLOCK = BigInt(D.deployBlock || 0);

export function need(value, what) {
  if (!value) {
    console.error(`  ${what} is not set.`);
    process.exit(1);
  }
  return value;
}
