/**
 * An agent buying one task's corpus, for real, and checking what it bought.
 *
 * AGENT_PRIVATE_KEY signs the EIP-3009 USDC authorisation x402 settles on
 * Monad. The wallet needs testnet USDC (faucet.circle.com, Monad testnet) and
 * no MON at all: the facilitator submits the transfer and pays the gas.
 *
 * The server answers 402, and the x402 wrapper pays a cent of USDC, final in
 * the Monad block it lands in.
 *
 * Then it hashes the bytes it received and asks SalesLog on Monad — not the
 * seller's server — whether a sale serving exactly those bytes was logged.
 *
 *   node --import ./test/register.mjs scripts/agent-buy.mjs [baseUrl] [taskId]
 */
import { createHash } from "node:crypto";
import { createPublicClient, formatUnits, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { AGENT_CORPUS } from "../lib/agent-corpus.ts";
import { SALES_LOG_ABI } from "../lib/registry-abi.ts";
import { ADDR, env, appChain, need, transport, txUrl } from "./monad.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const TASK = process.argv[3] ?? "1";

const wallet = privateKeyToAccount(need(env("AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY"));
const monad = createPublicClient({ chain: appChain, transport: transport() });

const usdc = await monad.readContract({
  address: AGENT_CORPUS.asset,
  abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
  functionName: "balanceOf",
  args: [wallet.address],
});

const payer = x402Client.fromConfig({
  schemes: [{ network: AGENT_CORPUS.network, client: new ExactEvmScheme(toClientEvmSigner(wallet, monad)) }],
  // Monad testnet USDC is not one of x402's default assets, so the client
  // refuses to pay in it unless told to. Allowed with a ceiling of 5 cents a pull.
  spendControls: {
    allowedAssets: [{ network: AGENT_CORPUS.network, asset: AGENT_CORPUS.asset, maxAmountPerPayment: "50000" }],
  },
});

const fetchPaid = wrapFetchWithPayment(fetch, payer);

const url = `${BASE}${AGENT_CORPUS.path}?taskId=${TASK}`;
console.log(`agent     ${wallet.address}  ${formatUnits(usdc, AGENT_CORPUS.decimals)} USDC on ${appChain.name}`);
console.log(`get       ${url}`);

const t0 = Date.now();
const res = await fetchPaid(url, { headers: { accept: "application/json" } });
console.log(`status    ${res.status} after ${Date.now() - t0} ms`);

const receipt = res.headers.get("PAYMENT-RESPONSE");
if (receipt) {
  const s = decodePaymentResponseHeader(receipt);
  console.log(`settled   ${s.success}  tx ${s.transaction}  payer ${s.payer ?? "-"}  ${s.network}`);
  if (s.transaction) console.log(`explorer  ${txUrl(s.transaction)}`);
}

const bytes = Buffer.from(await res.arrayBuffer());
if (!res.ok) {
  console.log(bytes.toString("utf8").slice(0, 2000));
  process.exit(1);
}

const body = JSON.parse(bytes.toString("utf8"));
console.log(
  `corpus    ${body.dataset}: ${body.episodes} episodes, ${body.total_frames} frames, ` +
    `${body.negatives.length} labelled failures`,
);

const digest = createHash("sha256").update(bytes).digest("hex");
const claimed = res.headers.get("x-thenar-sha256");
console.log(`sha256    ${digest}${claimed === digest ? "  (the server's figure agrees)" : `  (the server said ${claimed})`}`);

const audit = res.headers.get("x-thenar-audit");
const logged = audit?.match(/^(0x[0-9a-fA-F]{40})#(\d+)$/);
if (!logged || !ADDR.salesLog) {
  console.log(`audit     ${audit ?? "no audit header"}`);
  process.exit(0);
}

// Asked of the contract, not the server: how many sales served exactly these bytes,
// and what the entry the server named says.
const [, contract, seq] = logged;
const [served, sale] = await Promise.all([
  monad.readContract({ address: contract, abi: SALES_LOG_ABI, functionName: "servedCount", args: [`0x${digest}`] }),
  monad.readContract({ address: contract, abi: SALES_LOG_ABI, functionName: "getSale", args: [BigInt(seq)] }),
]);
console.log(
  `audit     SalesLog ${contract} #${seq}: ` +
    (sale.sha256 === `0x${digest}` ? "logs the same sha256 as the file received" : `logs a different sha256 (${sale.sha256})`) +
    `; ${served} sale(s) have served these exact bytes`,
);
