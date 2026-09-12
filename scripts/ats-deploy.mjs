/**
 * Issue Thenar's corpus security through Hedera's Asset Tokenization Studio.
 *
 * One call to the Studio's factory on testnet deploys an equity whose business
 * logic is Hedera's own, then this configures it the way the corpus needs:
 *
 *  - a whitelist control list, so a share can only sit with an address the
 *    server has put there after a World ID proof;
 *  - the issuer holding the issuer, control-list and corporate-actions roles,
 *    and nothing else holding any;
 *  - a common dividend right, so corpus sales can be paid out to holders.
 *
 * Simulated before anything is sent, so a refusal comes back as the name of the
 * rule that refused and costs nothing.
 *
 *   node scripts/ats-deploy.mjs           simulate, deploy, configure
 *   node scripts/ats-deploy.mjs --check   simulate only; sends nothing
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEventLogs, zeroAddress, formatEther } from "viem";
import { hederaTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ATS_ASSET_ABI, ATS_FACTORY_ABI, ATS_RESOLVER_ABI } from "../lib/ats-abi.ts";
import { ATS, ATS_ROLE } from "../lib/ats.ts";

const check = process.argv.includes("--check");

const env = (name) => {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};

/** An ISIN's check digit: letters become 10–35, then Luhn over the digits. */
function isin(base11) {
  const digits = base11.split("").map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) d *= 2;
    sum += Math.floor(d / 10) + (d % 10);
  }
  return base11 + ((10 - (sum % 10)) % 10);
}

const key = env("HEDERA_ATS_ISSUER_KEY");
if (!key) {
  console.error("HEDERA_ATS_ISSUER_KEY is not set in .env.local");
  process.exit(1);
}
const hex = key.replace(/^0x/, "");
const account = privateKeyToAccount(`0x${hex.length > 64 ? hex.slice(-64) : hex}`);
const transport = http(ATS.rpc, { timeout: 120_000, retryCount: 2 });
const client = createPublicClient({ chain: hederaTestnet, transport });
const wallet = createWalletClient({ account, chain: hederaTestnet, transport });

const balance = await client.getBalance({ address: account.address });
console.log(`\n  issuer   ${account.address}  ${Number(formatEther(balance)).toFixed(2)} HBAR`);

const version = await client.readContract({
  address: ATS.resolver.evm, abi: ATS_RESOLVER_ABI, functionName: "getLatestVersionByConfiguration",
  args: [ATS.equityConfigId],
});
const ISIN = isin("USTHNRCRP01");
console.log(`  factory  ${ATS.factory.id}  resolver ${ATS.resolver.id}  equity config v${version}  ISIN ${ISIN}`);

const equityData = {
  security: {
    resolver: ATS.resolver.evm,
    maxSupply: BigInt(1_000_000),
    resolverProxyConfiguration: { key: ATS.equityConfigId, version },
    erc20MetadataInfo: { name: "Thenar Robot Corpus", symbol: "THNRC", isin: ISIN, decimals: 0 },
    rbacs: [
      { role: ATS_ROLE.admin, members: [account.address] },
      { role: ATS_ROLE.issuer, members: [account.address] },
      { role: ATS_ROLE.controlList, members: [account.address] },
      { role: ATS_ROLE.corporateActions, members: [account.address] },
    ],
    externalPauses: [],
    externalControlLists: [],
    externalKycLists: [],
    compliance: zeroAddress,
    identityRegistry: zeroAddress,
    arePartitionsProtected: false,
    isMultiPartition: false,
    isControllable: true,
    isWhiteList: true,
    clearingActive: false,
    internalKycActivated: false,
    erc20VotesActivated: false,
  },
  equityDetails: {
    votingRight: false,
    informationRight: true,
    liquidationRight: false,
    subscriptionRight: false,
    conversionRight: false,
    redemptionRight: false,
    putRight: false,
    dividendRight: 2, // COMMON: pro rata across holders
    currency: "0x555344", // USD
    nominalValue: BigInt(1),
    nominalValueDecimals: 2,
  },
};
const regulation = {
  regulationType: 1, // Reg S
  regulationSubType: 0,
  additionalSecurityData: {
    countriesControlListType: false,
    listOfCountries: "",
    info: "A share of Thenar's teleoperation corpus. Holders are World ID-verified humans who drove the arm.",
  },
};

console.log("  1/3  simulate deployEquity");
const sim = await client.simulateContract({
  account, address: ATS.factory.evm, abi: ATS_FACTORY_ABI, functionName: "deployEquity",
  args: [equityData, regulation],
});
console.log(`       would deploy at ${sim.result}`);
if (check) process.exit(0);

console.log("  2/3  deploy");
const deployTx = await wallet.writeContract({ ...sim.request, gas: BigInt(12_000_000) });
const receipt = await client.waitForTransactionReceipt({ hash: deployTx, timeout: 180_000 });
if (receipt.status !== "success") {
  console.error(`       reverted: ${deployTx}`);
  process.exit(1);
}
const [deployed] = parseEventLogs({ abi: ATS_FACTORY_ABI, eventName: "EquityDeployed", logs: receipt.logs });
const security = deployed?.args.equityAddress ?? sim.result;
console.log(`       ${security}  tx ${deployTx}`);

let securityId = "";
for (let i = 0; i < 10 && !securityId; i++) {
  const r = await fetch(`${ATS.mirror}/contracts/${security}`).then((x) => x.json()).catch(() => ({}));
  securityId = r.contract_id ?? "";
  if (!securityId) await new Promise((ok) => setTimeout(ok, 3000));
}

console.log("  3/3  admit the issuer to the whitelist");
const listed = await client.readContract({
  address: security, abi: ATS_ASSET_ABI, functionName: "isInControlList", args: [account.address],
});
if (!listed) {
  const { request } = await client.simulateContract({
    account, address: security, abi: ATS_ASSET_ABI, functionName: "addToControlList", args: [account.address],
  });
  const tx = await wallet.writeContract(request);
  await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  console.log(`       tx ${tx}`);
}

console.log(`
  issued. add to .env.local:

    NEXT_PUBLIC_CORPUS_SECURITY=${security}
    NEXT_PUBLIC_CORPUS_SECURITY_ID=${securityId}

  ${ATS.hashscan}/contract/${securityId || security}
  ${ATS.hashscan}/transaction/${deployTx}
`);
