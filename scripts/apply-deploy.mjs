/**
 * Write lib/deployment.ts from deployments/arc-testnet.json and arc-mainnet.json.
 *
 *   node scripts/apply-deploy.mjs
 *
 * contracts/script/Deploy.s.sol writes those records itself, from the
 * addresses its own broadcast created (scripts/deploy.sh moves a record into
 * place only after the broadcast succeeded), so nothing here is typed by hand.
 * A record whose status is not "deployed" yields empty addresses, which every
 * page already reads as "not deployed yet".
 *
 * The fork's deployment never lands here: scripts/arc-fork.mjs puts it in
 * .env.fork as NEXT_PUBLIC_ARC_DEPLOYMENT, read by lib/chain.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const CONTRACT_KEYS = [
  "passkeyRegistry", "verdicts", "protocol", "trajectoryCertificate", "contributionRecord", "corpusManifest",
  "corpusShares", "salesLog", "corpusAudit", "ccipReceiver",
];
const EXTERNAL_KEYS = [
  "usdc", "erc8004IdentityRegistry", "erc8004ReputationRegistry", "erc8004ValidationRegistry", "ccipRouter",
  "ccipChainSelector", "memo", "cctpTokenMessengerV2", "cctpMessageTransmitterV2", "cctpDomain", "gatewayWallet",
  "gatewayMinter",
];

function load(network, chainId) {
  const file = `deployments/arc-${network}.json`;
  const r = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const deployed = r.status === "deployed";
  const contracts = Object.fromEntries(CONTRACT_KEYS.map((k) => [k, deployed ? (r.contracts?.[k] ?? "") : ""]));
  const external = Object.fromEntries(EXTERNAL_KEYS.map((k) => [k, String(r.external?.[k] ?? "")]));
  return {
    network,
    chainId: Number(r.chainId ?? chainId),
    status: deployed ? "deployed" : "not deployed",
    deployBlock: Number(deployed ? (r.deployBlock ?? 0) : 0),
    deployedAt: deployed && r.timestamp ? new Date(Number(r.timestamp) * 1000).toISOString() : "",
    deployer: r.deployer ?? "",
    verifier: r.verifier ?? "",
    issuer: r.issuer ?? "",
    auditor: r.auditor ?? "",
    treasury: r.treasury ?? "",
    maxTaskEscrow: String(r.maxTaskEscrow ?? ""),
    contracts,
    external,
  };
}

const testnet = load("testnet", 5042002);
const mainnet = load("mainnet", 5042);

const body = `/**
 * Thenar's deployments on Arc, as contracts/script/Deploy.s.sol recorded them
 * in deployments/arc-<network>.json. Written by scripts/apply-deploy.mjs; do
 * not edit by hand. An empty address means not deployed yet, which every
 * surface already knows how to say.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export type Deployment = {
  network: string;
  chainId: number;
  status: string;
  deployBlock: number;
  deployedAt: string;
  deployer: string;
  verifier: string;
  issuer: string;
  auditor: string;
  treasury: string;
  maxTaskEscrow: string;
  contracts: Record<${CONTRACT_KEYS.map((k) => JSON.stringify(k)).join(" | ")}, string>;
  external: Record<${EXTERNAL_KEYS.map((k) => JSON.stringify(k)).join(" | ")}, string>;
};

export const TESTNET_DEPLOYMENT: Deployment = ${JSON.stringify(testnet, null, 2)};

export const MAINNET_DEPLOYMENT: Deployment = ${JSON.stringify(mainnet, null, 2)};
`;
writeFileSync("lib/deployment.ts", body);
console.log(`lib/deployment.ts  testnet: ${testnet.status}  mainnet: ${mainnet.status}`);
