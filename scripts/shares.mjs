/**
 * Drive CorpusShares through its lifecycle on Arc (testnet, mainnet or the fork).
 *
 * The station issues shares and the passkey step whitelists operators on
 * their own; this is for the operations the issuer performs by hand, and for showing
 * each one working against the real contract rather than describing it.
 *
 *   NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/shares.mjs state
 *       supply, whitelist, dividends
 *   ... compliance 0x…        would the contract accept a share for this address?
 *                             asked by simulation, sends nothing
 *   ... dividend 0.01         declare a dividend of 0.01 USDC: approve, then setDividend pulls it;
 *                             record date in two minutes, payment two minutes after
 *   ... holder 0x…            one holder's shares and what each dividend owes them
 *   ... reclaim 1             take back dividend 1 if no share existed at its record date
 *
 * Every write is signed by CORPUS_ISSUER_PRIVATE_KEY, the only key the
 * contract lets admit, issue or declare.
 */
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, formatUnits, getAddress, parseAbi, parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CORPUS_SHARES_ABI } from "../lib/registry-abi.ts";
import { ADDR, ARC, env, appChain, need, transport, txUrl } from "./arc.mjs";

const usd = (u) => `${formatUnits(u, 6)} USDC`;

const [command, ...args] = process.argv.slice(2);
const shares = getAddress(need(ADDR.corpusShares, "CorpusShares' address (deploy, then scripts/apply-deploy.mjs)"));
const account = privateKeyToAccount(need(env("CORPUS_ISSUER_PRIVATE_KEY"), "CORPUS_ISSUER_PRIVATE_KEY"));
const client = createPublicClient({ chain: appChain, transport: transport() });
const wallet = createWalletClient({ account, chain: appChain, transport: transport() });
const token = { address: shares, abi: CORPUS_SHARES_ABI };

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

/** Simulate, send, wait — and print the transaction's explorer link. */
async function write(functionName, fnArgs) {
  const { request, result } = await client.simulateContract({ ...token, account, functionName, args: fnArgs });
  const tx = await wallet.writeContract(request);
  const t0 = Date.now();
  const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 30_000 });
  if (receipt.status !== "success") fail(`${functionName} reverted: ${tx}`);
  console.log(`  ${functionName} ✓ in ${Date.now() - t0} ms  ${txUrl(tx)}`);
  return result;
}

const read = (functionName, fnArgs = []) => client.readContract({ ...token, functionName, args: fnArgs });

switch (command) {
  case "state": {
    const [name, symbol, issuer, supply, count, dividends] = await Promise.all([
      read("name"), read("symbol"), read("issuer"), read("totalSupply"), read("getControlListCount"), read("getDividendsCount"),
    ]);
    const members = await read("getControlListMembers", [0n, 50n]);
    console.log(`\n  ${name} (${symbol})  ${shares}  issuer ${issuer}`);
    console.log(`  supply ${supply}   whitelist ${count}   dividends ${dividends}`);
    for (const m of members) console.log(`    ${m}  ${await read("balanceOf", [m])}`);
    break;
  }

  case "compliance": {
    const who = getAddress(args[0] ?? fail("usage: compliance 0x…"));
    try {
      await client.simulateContract({ ...token, account, functionName: "issue", args: [who, 1n, `0x${"00".repeat(32)}`] });
      console.log(`  ${who}: the contract would accept a share.`);
    } catch (e) {
      const rule = refusal(e);
      if (!rule) throw e;
      console.log(`  ${who}: refused by the contract — ${rule}`);
    }
    break;
  }

  case "dividend": {
    const amount = parseUnits(args[0] ?? fail("usage: dividend <USDC, e.g. 0.01>"), 6);
    const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"]);
    if ((await client.readContract({ address: ARC.usdc, abi: erc20, functionName: "allowance", args: [account.address, shares] })) < amount) {
      const a = await wallet.writeContract({ address: ARC.usdc, abi: erc20, functionName: "approve", args: [shares, amount] });
      await client.waitForTransactionReceipt({ hash: a });
      console.log(`  approve ✓ CorpusShares may pull ${usd(amount)}  ${txUrl(a)}`);
    }
    const now = Math.floor(Date.now() / 1000);
    const id = await write("setDividend", [BigInt(now + 120), BigInt(now + 240), amount]);
    console.log(`  dividend ${id}: ${usd(amount)}, holders snapshotted at ${new Date((now + 120) * 1000).toISOString()}`);
    break;
  }

  case "holder": {
    const who = getAddress(args[0] ?? fail("usage: holder 0x…"));
    const [listed, balance, count] = await Promise.all([read("isInControlList", [who]), read("balanceOf", [who]), read("getDividendsCount")]);
    console.log(`  ${who}: ${listed ? "listed" : "not listed"}, ${balance} shares`);
    for (let id = 1n; id <= count; id += 1n) {
      const [held, owed, , , reached, claimed] = await read("getDividendFor", [id, who]);
      console.log(`    dividend ${id}: ${reached ? `${held} shares at record, ${usd(owed)} owed${claimed ? ", claimed" : ""}` : "record date not reached"}`);
    }
    break;
  }

  case "reclaim": {
    const id = BigInt(args[0] ?? fail("usage: reclaim <dividend id>"));
    const amount = await write("reclaimDividend", [id]);
    console.log(`  dividend ${id}: ${usd(amount)} back to the issuer`);
    break;
  }

  default:
    fail("usage: node --import ./test/register.mjs scripts/shares.mjs state | compliance 0x… | dividend <USDC> | holder 0x… | reclaim <id>");
}
