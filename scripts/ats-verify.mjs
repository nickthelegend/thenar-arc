/**
 * Source-verify the corpus security on HashScan.
 *
 * HashScan verifies through Sourcify. The security is the Asset Tokenization
 * Studio's ResolverProxy, created by the Studio's factory, so its source is
 * Hedera's — but the published package leaves out the compiler's build-info,
 * which is what a verifier needs. This rebuilds the exact compiler input from
 * what the package does ship:
 *
 *  - the ResolverProxy source and everything it imports, from
 *    @hashgraph/asset-tokenization-contracts at the version that built it;
 *  - OpenZeppelin at the version that package pins;
 *  - the compiler the contract's own on-chain metadata names, with the
 *    optimizer and EVM settings from the Studio's hardhat config.
 *
 * Sourcify compiles it and compares against the chain. An exact match means the
 * metadata hash agrees too, so the source is byte-for-byte what is deployed.
 *
 *   node scripts/ats-verify.mjs
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ATS_CONTRACTS = "@hashgraph/asset-tokenization-contracts@8.0.0";
const TARGET = "contracts/infrastructure/proxy/ResolverProxy.sol";
const OZ = "@openzeppelin/contracts/";
const SOURCIFY = "https://sourcify.dev/server";
const CHAIN = 296;

/** The Studio's hardhat profiles, keyed by the solc version the metadata reports. */
const COMPILERS = {
  "0.8.28": { long: "0.8.28+commit.7893614a", evmVersion: "cancun" },
  "0.8.17": { long: "0.8.17+commit.8df45f5f", evmVersion: "london" },
};

const env = (name) => {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};

const address = env("NEXT_PUBLIC_CORPUS_SECURITY");
if (!address) {
  console.error("  NEXT_PUBLIC_CORPUS_SECURITY is not set — run scripts/ats-deploy.mjs first.");
  process.exit(1);
}

const status = await fetch(`${SOURCIFY}/v2/contract/${CHAIN}/${address}`).then((r) => r.json());
if (status.match) {
  console.log(`\n  already verified: ${status.match} (match ${status.matchId}, ${status.verifiedAt})`);
  process.exit(0);
}

const work = mkdtempSync(path.join(tmpdir(), "ats-verify-"));
const pack = (spec) =>
  path.join(work, execSync(`npm pack ${spec} --silent`, { cwd: work, encoding: "utf8" }).trim().split("\n").pop());
const fromTar = (tgz, member) => {
  try {
    return execSync(`tar -xzOf "${tgz}" "${member}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 << 20 });
  } catch {
    return null;
  }
};

try {
  const ats = pack(ATS_CONTRACTS);
  const manifest = JSON.parse(fromTar(ats, "package/package.json"));
  const deps = { ...manifest.devDependencies, ...manifest.peerDependencies, ...manifest.dependencies };
  const ozVersion = String(deps["@openzeppelin/contracts"] ?? "").replace(/^[^0-9]*/, "");
  const oz = pack(`@openzeppelin/contracts@${ozVersion}`);

  const sources = {};
  const visit = (unit) => {
    if (sources[unit]) return;
    const content = unit.startsWith(OZ) ? fromTar(oz, `package/${unit.slice(OZ.length)}`) : fromTar(ats, `package/${unit}`);
    if (content == null) throw new Error(`missing source ${unit}`);
    sources[unit] = { content };
    for (const m of content.matchAll(/import\s+(?:[^"';]*from\s+)?["']([^"']+)["']/g)) {
      const spec = m[1];
      visit(spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(unit), spec)) : spec);
    }
  };
  visit(TARGET);

  // The compiler version is in the contract's own CBOR metadata tail: "solc" followed by three bytes.
  const contract = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${address}`).then((r) => r.json());
  const runtime = contract.runtime_bytecode.slice(2);
  const tail = parseInt(runtime.slice(-4), 16);
  const cbor = runtime.slice(runtime.length - 4 - tail * 2, runtime.length - 4);
  const at = cbor.indexOf("64736f6c6343");
  const solc = [0, 2, 4].map((o) => parseInt(cbor.slice(at + 12 + o, at + 14 + o), 16)).join(".");
  const compiler = COMPILERS[solc];
  if (!compiler) throw new Error(`no compiler profile for solc ${solc}`);
  console.log(`\n  ${Object.keys(sources).length} sources · OpenZeppelin ${ozVersion} · solc ${compiler.long}`);

  const submitted = await fetch(`${SOURCIFY}/v2/verify/${CHAIN}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: {
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 100 },
          evmVersion: compiler.evmVersion,
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] } },
        },
      },
      compilerVersion: compiler.long,
      contractIdentifier: `${TARGET}:ResolverProxy`,
    }),
  }).then((r) => r.json());
  if (!submitted.verificationId) throw new Error(`Sourcify refused the job: ${JSON.stringify(submitted)}`);

  for (let i = 0; i < 40; i++) {
    const job = await fetch(`${SOURCIFY}/v2/verify/${submitted.verificationId}`).then((r) => r.json());
    if (job.isJobCompleted) {
      if (job.error) throw new Error(`${job.error.customCode}: ${job.error.message}`);
      console.log(`  verified: ${job.contract.match} (runtime ${job.contract.runtimeMatch}, match ${job.contract.matchId})`);
      console.log(`  https://hashscan.io/testnet/contract/${contract.contract_id}`);
      break;
    }
    await new Promise((ok) => setTimeout(ok, 5000));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
