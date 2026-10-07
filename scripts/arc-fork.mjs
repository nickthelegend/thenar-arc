/**
 * A local fork of Arc testnet, with Thenar deployed on it, for running every
 * flow end to end without spending testnet USDC.
 *
 *   node scripts/arc-fork.mjs              start it (deploy the first time), stay in the foreground
 *   node scripts/arc-fork.mjs --detach     start it in the background (PID in .fork/anvil.pid) and exit
 *   node scripts/arc-fork.mjs stop         stop the background fork this script started
 *   node scripts/arc-fork.mjs --fresh      throw the old fork's deployment away first
 *
 * Needs Circle's Arc Foundry (https://github.com/circlefin/arc-foundry): its
 * anvil runs `--network arc`, which executes Arc's native-USDC precompile, so
 * Circle's real USDC at 0x3600…0000 moves on the fork, and its forge deploys
 * through it. Set ARC_ANVIL / ARC_FORGE to the binaries (default: arc-anvil /
 * arc-forge on PATH). Plain anvil cannot move Arc's native USDC.
 *
 * What is real on the fork: Circle's USDC (EIP-3009, "USDC"/"2"), CCTP V2,
 * Gateway, the Memo predeploy, Arc's ERC-8004 registries, Chainlink's CCIP
 * router, and the P-256 precompile. What isn't: anything off chain (Circle's
 * attestation service, the CCIP DON), and the fork's RPC does not execute
 * Arc's CallFrom precompile, so Memo-wrapped calls are probed and sent plain
 * (lib/memo.ts); `forge test --network arc` does execute it.
 *
 * Keys: fresh throwaway keys made on first run, kept in .fork/keys.json
 * (git-ignored, 0600) and funded with fork USDC by setting their native
 * balance (on Arc that is the same balance the ERC-20 reports). None of them
 * is anvil's dev account #1, which Arc testnet's USDC blocklists.
 *
 *   deployer     deploys and funds the seed tasks
 *   verifier     signs scores; registered as an ERC-8004 agent and bound to ThenarVerdicts
 *   issuer       admits operators to CorpusShares, writes SalesLog, and is the audit keeper
 *   agent        a buyer agent with USDC: buys corpora over x402, registered as an ERC-8004 agent
 *   facilitator  submits x402 settlements (EIP-3009) and pays their gas in USDC
 *   faucet       sends USDC to a local wallet that asks (/localnet)
 *   relayer      relays runs and Gateway-funded tasks for wallets with no USDC
 *
 * Writes .fork/arc-fork.json (the deployment) and .env.fork (the env the app,
 * the scripts and the tests read). Ports: ARC_FORK_PORT, default 9000.
 */
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, decodeEventLog, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const PORT = process.env.ARC_FORK_PORT || "9000";
const RPC = `http://127.0.0.1:${PORT}`;
const UPSTREAM = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io";
const APP_PORT = process.env.APP_PORT || "9010";
const ANVIL = process.env.ARC_ANVIL || "arc-anvil";
const FORGE = process.env.ARC_FORGE || "arc-forge";
const DIR = ".fork";
const PID = `${DIR}/anvil.pid`;
const RECORD = `${DIR}/arc-fork.json`;

mkdirSync(DIR, { recursive: true });

if (process.argv[2] === "stop") {
  if (existsSync(PID)) {
    const pid = Number(readFileSync(PID, "utf8"));
    try { process.kill(pid, "SIGTERM"); console.log(`stopped   anvil ${pid}`); } catch { console.log(`anvil ${pid} was not running`); }
    rmSync(PID, { force: true });
  } else console.log("no fork started by this script is running");
  process.exit(0);
}
if (process.argv.includes("--fresh")) rmSync(RECORD, { force: true });
const detach = process.argv.includes("--detach");

const client = createPublicClient({ transport: http(RPC) });
const up = () => client.getChainId().then((id) => id === 5042002, () => false);

let anvil = null;
if (await up()) {
  console.log(`fork      a fork is already answering at ${RPC}; using it`);
} else {
  const args = ["--network", "arc", "--fork-url", UPSTREAM, "--port", PORT, "--host", "127.0.0.1", "--block-time", "1", "--silent"];
  if (detach) {
    const log = openSync(`${DIR}/anvil.log`, "a");
    anvil = spawn(ANVIL, args, { detached: true, stdio: ["ignore", log, log] });
    anvil.unref();
    writeFileSync(PID, String(anvil.pid));
  } else {
    anvil = spawn(ANVIL, args, { stdio: ["ignore", "inherit", "inherit"] });
    anvil.on("exit", (code) => { console.log(`anvil exited ${code}`); process.exit(code ?? 0); });
    for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => anvil.kill("SIGINT"));
  }
  anvil.on("error", (e) => { console.error(`could not start ${ANVIL}: ${e.message}. Set ARC_ANVIL to Arc Foundry's anvil.`); process.exit(1); });
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) throw new Error(`the fork did not start on ${RPC} (see ${DIR}/anvil.log)`);
  console.log(`fork      Arc testnet forked at block ${await client.getBlockNumber()} on ${RPC}${detach ? ` (pid ${anvil.pid})` : ""}`);
}

// ------------------------------------------------------------------ keys
const ROLE_NAMES = ["deployer", "verifier", "issuer", "agent", "facilitator", "faucet", "relayer"];
const KEYS = `${DIR}/keys.json`;
const keys = existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, "utf8")) : {};
for (const r of ROLE_NAMES) keys[r] ??= generatePrivateKey();
writeFileSync(KEYS, JSON.stringify(keys, null, 2));
chmodSync(KEYS, 0o600);
const ROLES = Object.fromEntries(ROLE_NAMES.map((r) => [r, { key: keys[r], address: privateKeyToAccount(keys[r]).address }]));

const rpc = (method, params) => client.request({ method, params });
// 10,000 USDC each, as native balance (18 decimals); the ERC-20 at 0x3600… reports it at 6.
for (const r of ROLE_NAMES) await rpc("anvil_setBalance", [ROLES[r].address, `0x${parseEther("10000").toString(16)}`]);
console.log(`funded    ${ROLE_NAMES.length} role keys with 10,000 USDC each`);

// ---------------------------------------------------------------- deploy
const hasCode = async (address) => ((await client.getCode({ address }).catch(() => "0x")) ?? "0x").length > 2;
let record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : null;
if (!record || !(await hasCode(record.contracts.protocol))) {
  console.log("deploy    contracts/script/Deploy.s.sol (NETWORK=local)");
  // The fork shares testnet's chain id, so keep forge's record of this deploy apart from a real testnet one.
  const B = "contracts/broadcast/Deploy.s.sol/5042002";
  const KEEP = `${DIR}/broadcast-testnet-keep`;
  rmSync(KEEP, { recursive: true, force: true });
  if (existsSync(B)) { cpSync(B, KEEP, { recursive: true }); rmSync(B, { recursive: true, force: true }); }
  const restore = () => {
    if (existsSync(B)) { rmSync(`${DIR}/broadcast`, { recursive: true, force: true }); cpSync(B, `${DIR}/broadcast`, { recursive: true }); rmSync(B, { recursive: true, force: true }); }
    if (existsSync(KEEP)) { cpSync(KEEP, B, { recursive: true }); rmSync(KEEP, { recursive: true, force: true }); }
  };
  await new Promise((ok, no) => {
    const p = spawn(FORGE, ["script", "script/Deploy.s.sol:Deploy", "--network", "arc", "--rpc-url", RPC, "--broadcast", "--slow", "-q"], {
      cwd: "contracts",
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        NETWORK: "local",
        DEPLOYER_PRIVATE_KEY: ROLES.deployer.key,
        THENAR_VERIFIER_ADDRESS: ROLES.verifier.address,
        THENAR_ISSUER_ADDRESS: ROLES.issuer.address,
        THENAR_AUDITOR_ADDRESS: ROLES.issuer.address,
        THENAR_DEPLOYMENT_OUT: `${process.cwd()}/${RECORD}`,
      },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", no);
    p.on("exit", (code) => (code === 0 ? ok(out) : (console.log(out), no(new Error("Deploy.s.sol failed")))));
  }).finally(restore);
  record = JSON.parse(readFileSync(RECORD, "utf8"));
  console.log(`deployed  ThenarProtocol ${record.contracts.protocol} at block ${record.deployBlock}`);
}

// ------------------------------------------- ERC-8004: verifier and agent
const IDENTITY = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
const VERDICTS = parseAbi([
  "function verifierAgent() view returns (bool bound, uint256 agentId)",
  "function bindVerifier(uint256 agentId)",
]);
const chain = { id: 5042002, name: "Arc fork", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const walletOf = (r) => createWalletClient({ account: privateKeyToAccount(ROLES[r].key), chain, transport: http(RPC) });

async function registerAgent(role, uri) {
  const w = walletOf(role);
  const hash = await w.writeContract({ address: record.external.erc8004IdentityRegistry, abi: IDENTITY, functionName: "register", args: [uri] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: IDENTITY, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer" && ev.args.to.toLowerCase() === ROLES[role].address.toLowerCase()) return ev.args.tokenId;
    } catch { /* another event */ }
  }
  throw new Error(`no agent id in ${hash}`);
}

const [bound, boundId] = await client.readContract({ address: record.contracts.verdicts, abi: VERDICTS, functionName: "verifierAgent" });
let verifierAgentId = bound ? boundId : null;
if (!bound) {
  verifierAgentId = await registerAgent("verifier", `http://localhost:${APP_PORT}/api/agents/verifier.json`);
  const hash = await walletOf("relayer").writeContract({ address: record.contracts.verdicts, abi: VERDICTS, functionName: "bindVerifier", args: [verifierAgentId] });
  await client.waitForTransactionReceipt({ hash });
  console.log(`erc-8004  verifier is agent #${verifierAgentId}, bound to ThenarVerdicts`);
}
record.agents ??= {};
record.agents.verifier = String(verifierAgentId);
if (!record.agents.buyer) {
  const id = await registerAgent("agent", `http://localhost:${APP_PORT}/api/agents/buyer.json`);
  record.agents.buyer = String(id);
  console.log(`erc-8004  buyer agent is agent #${id}`);
}
writeFileSync(RECORD, JSON.stringify(record, null, 2));

// ------------------------------------------------------------------ env
const deployment = {
  network: "fork",
  chainId: 5042002,
  status: "deployed",
  deployBlock: Number(record.deployBlock),
  deployedAt: new Date(Number(record.timestamp) * 1000).toISOString(),
  deployer: record.deployer,
  verifier: record.verifier,
  issuer: record.issuer,
  auditor: record.auditor,
  treasury: record.treasury,
  maxTaskEscrow: String(record.maxTaskEscrow),
  contracts: record.contracts,
  external: Object.fromEntries(Object.entries(record.external).map(([k, v]) => [k, String(v)])),
};
writeFileSync(".env.fork", `# Written by scripts/arc-fork.mjs. Throwaway keys for a local Arc fork only. Never use them anywhere else.
NEXT_PUBLIC_ARC_NETWORK=fork
NEXT_PUBLIC_FORK_RPC=${RPC}
NEXT_PUBLIC_SITE_ORIGIN=http://localhost:${APP_PORT}
LOCAL_APP_URL=http://localhost:${APP_PORT}
PUBLIC_ORIGIN=http://localhost:${APP_PORT}
AXON_DB_PATH=.data/fork.db
NEXT_PUBLIC_ARC_DEPLOYMENT=${JSON.stringify(deployment)}
DEPLOYER_ADDRESS=${ROLES.deployer.address}
VERIFIER_PRIVATE_KEY=${ROLES.verifier.key}
VERIFIER_ADDRESS=${ROLES.verifier.address}
VERIFIER_AGENT_ID=${verifierAgentId}
CORPUS_ISSUER_PRIVATE_KEY=${ROLES.issuer.key}
CORPUS_ISSUER_ADDRESS=${ROLES.issuer.address}
AUDITOR_PRIVATE_KEY=${ROLES.issuer.key}
AGENT_PRIVATE_KEY=${ROLES.agent.key}
AGENT_ADDRESS=${ROLES.agent.address}
AGENT_ID=${record.agents.buyer}
X402_FACILITATOR_PRIVATE_KEY=${ROLES.facilitator.key}
LOCAL_FAUCET_PRIVATE_KEY=${ROLES.faucet.key}
RELAYER_PRIVATE_KEY=${ROLES.relayer.key}
CORPUS_TREASURY=${record.treasury}
`);
chmodSync(".env.fork", 0o600);
console.log(`env       .env.fork written`);
console.log(`ready     ${RPC}  chain 5042002  block ${await client.getBlockNumber()}`);
if (detach || !anvil) process.exit(0);
