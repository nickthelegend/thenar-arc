/**
 * A local chain with Monad's shape, and Thenar deployed on it.
 *
 *   node scripts/localnet.mjs            start it (and deploy, the first time)
 *   node scripts/localnet.mjs --fresh    throw the old chain away first
 *
 * Anvil with the Osaka hardfork has the P-256 precompile at 0x0100 that Monad
 * has, so a passkey is checked on this chain exactly as it is on Monad. The
 * contracts are deployed by the same DeployMonad.s.sol, then a USDC with
 * Circle's EIP-3009 interface, which Monad has from Circle and anvil has from
 * nobody. Multicall3 is copied to its canonical address from Monad itself.
 *
 * Every key here is one of anvil's published test accounts, derived from the
 * public test mnemonic: none of them is anyone's, and none of them is Monad's.
 *
 *   #0 deployer   funds the tasks, as the Monad deployer does
 *   #1 verifier   signs scores
 *   #2 issuer     admits operators to CorpusShares, logs sales to SalesLog
 *   #3 agent      buys the corpus over x402, holds local USDC
 *   #4 facilitator submits x402 settlements and pays their gas
 *   #5 faucet     sends MON and USDC to a local wallet that asks
 *
 * Writes lib/deployment-local.ts (the same every fresh start, since the
 * deployer's nonces are) and .env.localnet, then keeps the chain running. The
 * chain's state is kept in .localnet/state.json across restarts.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { concat, createPublicClient, createWalletClient, getAddress, getContractAddress, http, toHex, zeroHash } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8645";
const PORT = new URL(RPC).port || "8545";
const DIR = ".localnet";
const STATE = `${DIR}/state.json`;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MNEMONIC = "test test test test test test test test test test test junk";

const key = (i) => {
  const a = mnemonicToAccount(MNEMONIC, { addressIndex: i });
  return { address: a.address, key: toHex(a.getHdKey().privateKey) };
};
const ROLES = {
  deployer: key(0), verifier: key(1), issuer: key(2), agent: key(3), facilitator: key(4), faucet: key(5),
  // Pays the gas for wallets in sponsored mode, as Privy's sponsorship does on Monad.
  sponsor: key(9),
};

const fresh = process.argv.includes("--fresh");
if (fresh) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const client = createPublicClient({ transport: http(RPC) });
const up = () => client.getChainId().then((id) => id === 31337, () => false);

let anvil = null;
if (await up()) {
  console.log(`localnet  a chain is already answering at ${RPC}; using it`);
} else {
  anvil = spawn("anvil", [
    "--hardfork", "osaka", "--chain-id", "31337", "--port", PORT, "--host", "127.0.0.1",
    // A block every second whether or not anything is sent, as Monad makes
    // them, so the chain's clock keeps time; a transaction is still mined
    // the moment it arrives.
    "--block-time", "1", "--mixed-mining",
    "--state", STATE, "--state-interval", "5",
    "--mnemonic", MNEMONIC, "--balance", "100000",
    // Keep only recent states in memory: this machine runs other chains too.
    "--prune-history", "300",
  ], { stdio: ["ignore", "pipe", "inherit"] });
  anvil.stdout.on("data", (b) => {
    const s = String(b);
    // anvil prints every request; keep the transactions and mined blocks.
    for (const line of s.split("\n")) if (/Transaction:|Contract created|Block Number|Listening/.test(line)) console.log(`anvil     ${line.trim()}`);
  });
  anvil.on("exit", (code) => { console.log(`anvil exited ${code}`); process.exit(code ?? 0); });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => anvil.kill("SIGINT"));
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) throw new Error("anvil did not start");
}

const rpc = (method, params) => client.request({ method, params });

// Multicall3, byte for byte what Monad has at the same address.
const hasCode = async (address) => ((await client.getCode({ address })) ?? "0x").length > 2;
if (!(await hasCode(MULTICALL3))) {
  const cache = `${DIR}/multicall3.hex`;
  let code = existsSync(cache) ? readFileSync(cache, "utf8").trim() : "";
  if (!code) {
    const monad = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
    code = await monad.getCode({ address: MULTICALL3 });
    if (!code || code.length < 100) throw new Error("could not read Multicall3 from Monad");
    writeFileSync(cache, code);
  }
  await rpc("anvil_setCode", [MULTICALL3, code]);
  console.log(`multicall ${MULTICALL3} (${(code.length - 2) / 2} bytes, from Monad)`);
}

// Deployed already? The addresses are deterministic, so ask the one we wrote.
const written = existsSync("lib/deployment-local.ts") ? readFileSync("lib/deployment-local.ts", "utf8") : "";
const axonWritten = written.match(/axon: "(0x[0-9a-fA-F]{40})"/)?.[1];
const deployed = axonWritten && (await hasCode(axonWritten));

if (!deployed) {
  // Asynchronous, never spawnSync: this process is also reading anvil's output.
  // Blocked in spawnSync, it stopped draining anvil's stdout; once the pipe
  // filled, anvil blocked on its next log line and stopped answering, and
  // forge's deploy timed out (on Linux, with its smaller pipe buffer, on every
  // fresh chain).
  const forge = (script, extra) => new Promise((ok, no) => {
    const p = spawn("forge", ["script", script, "--rpc-url", RPC, "--broadcast", "--slow", "-q"], {
      cwd: "contracts", stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, DEPLOYER_PRIVATE_KEY: ROLES.deployer.key, ...extra },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", no);
    p.on("exit", (code) => (code === 0 ? ok(out) : (console.log(out), no(new Error(`${script} failed`)))));
  });
  console.log("deploy    DeployMonad.s.sol");
  await forge("script/DeployMonad.s.sol:DeployMonad", {
    VERIFIER_ADDRESS: ROLES.verifier.address, CORPUS_ISSUER_ADDRESS: ROLES.issuer.address,
  });
  console.log("deploy    DeployLocalnet.s.sol (USDC)");
  await forge("script/DeployLocalnet.s.sol:DeployLocalnet", { LOCAL_AGENT_ADDRESS: ROLES.agent.address, LOCAL_FAUCET_ADDRESS: ROLES.faucet.address });

  const record = (script) => JSON.parse(readFileSync(`contracts/broadcast/${script}/31337/run-latest.json`, "utf8"));
  const KEYS = {
    PasskeyRegistry: "passkeyRegistry", AxonProtocolV2: "axon", TrajectoryCertificate: "trajectoryCertificate",
    ContributionRecord: "contributionRecord", CorpusAccess: "corpusAccess", CorpusManifest: "corpusManifest",
    CorpusShares: "corpusShares", SalesLog: "salesLog", Referrals: "referrals", Foundry: "foundry",
    PrizePool: "prizePool", ConfidentialPayouts: "confidentialPayouts",
  };
  const contracts = Object.fromEntries(Object.values(KEYS).map((k) => [k, ""]));
  const main = record("DeployMonad.s.sol");
  let axonHash = null;
  for (const t of main.transactions) {
    if (t.transactionType !== "CREATE" || !KEYS[t.contractName]) continue;
    contracts[KEYS[t.contractName]] = getAddress(t.contractAddress);
    if (t.contractName === "AxonProtocolV2") axonHash = t.hash;
  }
  const usdc = getAddress(record("DeployLocalnet.s.sol").transactions.find((t) => t.contractName === "LocalUSDC").contractAddress);
  const axonReceipt = main.receipts.find((r) => r.transactionHash === axonHash);
  const deployBlock = Number(BigInt(axonReceipt.blockNumber));

  const body = Object.entries(contracts).map(([k, v]) => `    ${k}: "${v}",`).join("\n");
  writeFileSync("lib/deployment-local.ts", `/**
 * The local chain's deployment, as scripts/localnet.mjs left it.
 *
 * Anvil's first account deploys the same contracts DeployMonad.s.sol puts on
 * Monad, in the same order, on a fresh chain, so these addresses are the same
 * every time the local chain is started from nothing. Used only when
 * NEXT_PUBLIC_CHAIN=local.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export const LOCAL_DEPLOYMENT = {
  chainId: 31337,
  deployBlock: ${deployBlock},
  deployedAt: "",
  deployer: "${ROLES.deployer.address}",
  verifier: "${ROLES.verifier.address}",
  usdc: "${usdc}",
  contracts: {
${body}
  },
} as const;
`);
  console.log(`deployed  axon ${contracts.axon} at block ${deployBlock}, USDC ${usdc}`);
}

// The EIP-7702 account sponsored wallets delegate to, at its CREATE2 address
// through the deployer anvil ships with, so it is the same on any local chain
// built from the same source. It stands in for the smart account Privy's gas
// sponsorship delegates an embedded wallet to on Monad.
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const accountArtifact = "contracts/out/SponsoredAccount.sol/SponsoredAccount.json";
if (!existsSync(accountArtifact)) {
  // Asynchronous for the same reason as the deploy: anvil's output must keep draining.
  await new Promise((ok) => spawn("forge", ["build", "-q"], { cwd: "contracts", stdio: "inherit" }).on("exit", ok));
}
const accountCode = JSON.parse(readFileSync(accountArtifact, "utf8")).bytecode.object;
const sponsoredAccount = getContractAddress({ opcode: "CREATE2", from: CREATE2_DEPLOYER, salt: zeroHash, bytecode: accountCode });
if (!(await hasCode(sponsoredAccount))) {
  const deployer = createWalletClient({ account: mnemonicToAccount(MNEMONIC, { addressIndex: 0 }), transport: http(RPC), chain: null });
  const hash = await deployer.sendTransaction({ to: CREATE2_DEPLOYER, data: concat([zeroHash, accountCode]) });
  await client.waitForTransactionReceipt({ hash });
  console.log(`deploy    SponsoredAccount ${sponsoredAccount}`);
}

// The env the local app, the facilitator and the scripts run with.
const dep = readFileSync("lib/deployment-local.ts", "utf8");
const usdc = dep.match(/usdc: "(0x[0-9a-fA-F]{40})"/)[1];
writeFileSync(".env.localnet", `# Written by scripts/localnet.mjs. Anvil's published test accounts only.
NEXT_PUBLIC_CHAIN=local
NEXT_PUBLIC_LOCAL_RPC=${RPC}
NEXT_PUBLIC_SITE_ORIGIN=http://localhost:3336
LOCAL_APP_URL=http://localhost:3336
AXON_DB_PATH=.data/localnet.db
DEPLOYER_PRIVATE_KEY=${ROLES.deployer.key}
DEPLOYER_ADDRESS=${ROLES.deployer.address}
VERIFIER_PRIVATE_KEY=${ROLES.verifier.key}
VERIFIER_ADDRESS=${ROLES.verifier.address}
CORPUS_ISSUER_PRIVATE_KEY=${ROLES.issuer.key}
CORPUS_ISSUER_ADDRESS=${ROLES.issuer.address}
AGENT_PRIVATE_KEY=${ROLES.agent.key}
AGENT_ADDRESS=${ROLES.agent.address}
X402_FACILITATOR_URL=http://127.0.0.1:4021
X402_FACILITATOR_PRIVATE_KEY=${ROLES.facilitator.key}
LOCAL_FAUCET_PRIVATE_KEY=${ROLES.faucet.key}
LOCAL_SPONSOR_PRIVATE_KEY=${ROLES.sponsor.key}
NEXT_PUBLIC_LOCAL_SPONSORED_ACCOUNT=${sponsoredAccount}
`);
console.log(`env       .env.localnet written`);
console.log(`ready     ${RPC}  chain 31337  block ${await client.getBlockNumber()}`);
if (!anvil) process.exit(0);
