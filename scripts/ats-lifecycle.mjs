/**
 * Drive the corpus security through its lifecycle on Hedera testnet.
 *
 * The station issues shares and whitelists humans on its own; this is for the
 * operations the issuer performs by hand, and for showing each one working
 * against the real security rather than describing it.
 *
 *   node scripts/ats-lifecycle.mjs state                 supply, whitelist, dividends
 *   node scripts/ats-lifecycle.mjs compliance 0x…        would the security accept a share for this
 *                                                        address? asked by simulation, sends nothing
 *   node scripts/ats-lifecycle.mjs reserve 1000          issue a treasury reserve to the issuer
 *   node scripts/ats-lifecycle.mjs transfer 0x… 10       move reserve shares to a whitelisted holder
 *   node scripts/ats-lifecycle.mjs dividend 0.05         declare a dividend per share; record date in
 *                                                        two minutes, payment two minutes after
 *
 * A dividend here is what the Studio records: the entitlement per share at the
 * record date, readable by every holder. Paying it out is a separate transfer.
 */
import { readFileSync } from "node:fs";
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, getAddress, http,
} from "viem";
import { hederaTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ATS_ASSET_ABI } from "../lib/ats-abi.ts";
import { ATS } from "../lib/ats.ts";

const env = (name) => {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};

const [command, ...args] = process.argv.slice(2);
const security = env("NEXT_PUBLIC_CORPUS_SECURITY");
const key = env("HEDERA_ATS_ISSUER_KEY");
if (!security) fail("NEXT_PUBLIC_CORPUS_SECURITY is not set — run scripts/ats-deploy.mjs first.");
if (!key) fail("HEDERA_ATS_ISSUER_KEY is not set in .env.local");

const hex = key.replace(/^0x/, "");
const account = privateKeyToAccount(`0x${hex.length > 64 ? hex.slice(-64) : hex}`);
const transport = http(ATS.rpc, { timeout: 120_000, retryCount: 2 });
const client = createPublicClient({ chain: hederaTestnet, transport });
const wallet = createWalletClient({ account, chain: hederaTestnet, transport });
const token = { address: getAddress(security), abi: ATS_ASSET_ABI };

function fail(message) {
  console.error(`  ${message}`);
  process.exit(1);
}

/** The name of the rule that refused, which is what a person can act on. */
function refusal(e) {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? "reverted";
  }
  return null;
}

/** Simulate, send, wait — and print the transaction as HashScan shows it. */
async function write(functionName, fnArgs) {
  const { request, result } = await client.simulateContract({ ...token, account, functionName, args: fnArgs });
  const tx = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (receipt.status !== "success") fail(`${functionName} reverted: ${tx}`);
  console.log(`  ${functionName} ✓  ${ATS.hashscan}/transaction/${tx}`);
  return result;
}

const read = (functionName, fnArgs = []) => client.readContract({ ...token, functionName, args: fnArgs });

switch (command) {
  case "state": {
    const [meta, supply, count, dividends] = await Promise.all([
      read("getERC20Metadata"), read("totalSupply"), read("getControlListCount"), read("getDividendsCount"),
    ]);
    const members = await read("getControlListMembers", [0n, 50n]);
    console.log(`\n  ${meta.info.name} (${meta.info.symbol})  ISIN ${meta.info.isin}  ${security}`);
    console.log(`  supply ${supply}   whitelist ${count}   dividends ${dividends}`);
    for (const m of members) console.log(`    ${m}  ${await read("balanceOf", [m])}`);
    break;
  }

  case "compliance": {
    const who = getAddress(args[0] ?? fail("usage: compliance 0x…"));
    try {
      await client.simulateContract({
        ...token, account, functionName: "issueByPartition",
        args: [{ partition: ATS.partition, tokenHolder: who, value: 1n, data: "0x" }],
      });
      console.log(`  ${who}: the security would accept a share.`);
    } catch (e) {
      const rule = refusal(e);
      if (!rule) throw e;
      console.log(`  ${who}: refused by the security — ${rule}`);
    }
    break;
  }

  case "reserve": {
    const units = BigInt(args[0] ?? fail("usage: reserve <shares>"));
    await write("issueByPartition", [{ partition: ATS.partition, tokenHolder: account.address, value: units, data: "0x" }]);
    break;
  }

  case "transfer": {
    const to = getAddress(args[0] ?? fail("usage: transfer 0x… <shares>"));
    const units = BigInt(args[1] ?? fail("usage: transfer 0x… <shares>"));
    await write("transferByPartition", [ATS.partition, { to, value: units }, "0x"]);
    break;
  }

  case "dividend": {
    const perShare = args[0] ?? fail("usage: dividend <amount per share, e.g. 0.05>");
    const [whole, frac = ""] = perShare.split(".");
    const now = Math.floor(Date.now() / 1000);
    const id = await write("setDividend", [{
      recordDate: BigInt(now + 120),
      executionDate: BigInt(now + 240),
      amount: BigInt(`${whole}${frac}`),
      amountDecimals: frac.length,
    }]);
    console.log(`  dividend ${id}: ${perShare} per share, holders snapshotted at ${new Date((now + 120) * 1000).toISOString()}`);
    break;
  }

  default:
    fail("usage: node scripts/ats-lifecycle.mjs state | compliance 0x… | reserve <n> | transfer 0x… <n> | dividend <per share>");
}
