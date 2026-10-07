/**
 * Write lib/deployment.ts from forge's record of the Monad deploy.
 *
 *   node scripts/apply-deploy.mjs
 *
 * Reads the newest record under contracts/broadcast/DeployMonad.s.sol/10143
 * whose every transaction has a successful receipt, and takes each address
 * from the CREATE that made it. Nothing is typed in by hand, so an address in
 * the app is an address a transaction created — the registry was wrong once
 * when it was copied from a terminal, and that is the guard.
 *
 * Not run-latest.json. On Monad, forge wrote a second record a minute after a
 * confirmed broadcast, simulated against an endpoint that had not caught up:
 * nonces five behind, predicted addresses that hold other contracts, and no
 * hashes or receipts at all — and it overwrote run-latest with it.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";

const DIR = "contracts/broadcast/DeployMonad.s.sol/10143";
const confirmed = (r) =>
  r.transactions.length > 0 &&
  r.receipts.length === r.transactions.length &&
  r.transactions.every((t) => t.hash && r.receipts.some((x) => x.transactionHash === t.hash && x.status === "0x1"));
const records = readdirSync(DIR)
  .filter((f) => /^run-\d+\.json$/.test(f))
  .map((f) => ({ f, r: JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) }))
  .filter(({ r }) => confirmed(r))
  .sort((a, b) => b.r.timestamp - a.r.timestamp);
if (!records.length) throw new Error(`no fully confirmed broadcast in ${DIR}`);
const RUN = `${DIR}/${records[0].f}`;
const run = records[0].r;

const KEYS = {
  PasskeyRegistry: "passkeyRegistry",
  AxonProtocolV2: "axon",
  TrajectoryCertificate: "trajectoryCertificate",
  ContributionRecord: "contributionRecord",
  CorpusAccess: "corpusAccess",
  CorpusManifest: "corpusManifest",
  CorpusShares: "corpusShares",
  SalesLog: "salesLog",
  Referrals: "referrals",
  Foundry: "foundry",
  PrizePool: "prizePool",
  ConfidentialPayouts: "confidentialPayouts",
};

const contracts = Object.fromEntries(Object.values(KEYS).map((k) => [k, ""]));
let axonHash = null;
for (const t of run.transactions) {
  if (t.transactionType !== "CREATE" || !KEYS[t.contractName]) continue;
  contracts[KEYS[t.contractName]] = getAddress(t.contractAddress);
  if (t.contractName === "AxonProtocolV2") axonHash = t.hash;
}

/**
 * Contracts replaced after the main broadcast, each by its own script, taken
 * from that script's newest confirmed record. DeployShares.s.sol replaced
 * CorpusShares with the version that can reclaim a dividend nobody holds.
 */
const OVERLAYS = { "DeployShares.s.sol": ["CorpusShares"] };
for (const [script, names] of Object.entries(OVERLAYS)) {
  const dir = `contracts/broadcast/${script}/10143`;
  let files = [];
  try { files = readdirSync(dir).filter((f) => /^run-\d+\.json$/.test(f)); } catch { continue; }
  const newest = files
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")))
    .filter(confirmed)
    .sort((x, y) => y.timestamp - x.timestamp)[0];
  if (!newest) continue;
  for (const t of newest.transactions) {
    if (t.transactionType === "CREATE" && names.includes(t.contractName)) {
      contracts[KEYS[t.contractName]] = getAddress(t.contractAddress);
    }
  }
}

const missing = Object.entries(contracts).filter(([, a]) => !a).map(([k]) => k);
if (missing.length) throw new Error(`${RUN} has no CREATE for ${missing.join(", ")}`);

const receipt = run.receipts.find((r) => r.transactionHash === axonHash);
if (!receipt) throw new Error("no receipt for the AxonProtocolV2 CREATE — was the broadcast confirmed?");
if (receipt.status !== "0x1") throw new Error("the AxonProtocolV2 CREATE reverted");
const deployBlock = Number(BigInt(receipt.blockNumber));

const axonCreate = run.transactions.find((t) => t.hash === axonHash);
const deployer = getAddress(axonCreate.transaction.from);
const verifier = axonCreate.arguments?.[0] ? getAddress(axonCreate.arguments[0]) : "";
const deployedAt = new Date(Number(run.timestamp) * (run.timestamp > 1e12 ? 1 : 1000)).toISOString();

const body = `/**
 * The Monad testnet deployment, as contracts/script/DeployMonad.s.sol left it.
 *
 * Written by scripts/apply-deploy.mjs from forge's broadcast record, never by
 * hand, so an address here is an address a transaction created. Public on
 * purpose: every value is on chain already, and committing it means a fresh
 * checkout and the deployed site read the same contracts without either
 * needing an env file to agree.
 *
 * An empty address means not deployed yet, which every surface already knows
 * how to say.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export const DEPLOYMENT = {
  chainId: 10143,
  /** The block AxonProtocolV2 was created in. */
  deployBlock: ${deployBlock},
  deployedAt: "${deployedAt}",
  deployer: "${deployer}",
  verifier: "${verifier}",
  contracts: {
${Object.entries(contracts).map(([k, a]) => `    ${k}: "${a}",`).join("\n")}
  },
} as const;
`;

writeFileSync("lib/deployment.ts", body);
console.log(`lib/deployment.ts — ${Object.keys(contracts).length} contracts, AxonProtocolV2 at block ${deployBlock}`);
for (const [k, a] of Object.entries(contracts)) console.log(`  ${k.padEnd(22)} ${a}`);
