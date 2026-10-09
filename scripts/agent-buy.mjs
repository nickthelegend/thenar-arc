/**
 * An agent buying one task's corpus over x402 on Arc, checking what it
 * bought, and rating the verifier for it.
 *
 * AGENT_PRIVATE_KEY signs Circle USDC's EIP-3009 authorisation for a cent;
 * Thenar's in-process facilitator submits it and pays the gas (in USDC), and
 * the transfer is final in the Arc block it lands in. The agent names itself
 * with `x-erc8004-agent-id: AGENT_ID`; when the paying wallet is that agent's
 * wallet or owner in the Identity Registry, SalesLog records the sale with
 * the agent's id.
 *
 * Then it hashes the bytes it received, asks SalesLog — not the seller's
 * server — whether a sale serving exactly those bytes was logged, and rates
 * the verifier on the ERC-8004 Reputation Registry:
 *   giveFeedback(verifierId, rating 0–100, 0, "corpusQuality", "thenar", "/api/agent/corpus", "", sha256)
 * (`--no-rate` skips it; RATING=0..100 overrides the rating, which defaults to
 * 100 when SalesLog agrees with the bytes and 0 when it does not.)
 *
 *   NEXT_PUBLIC_ARC_NETWORK=fork node --import ./test/register.mjs scripts/agent-buy.mjs [baseUrl] [taskId] [--no-rate]
 */
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, formatUnits, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { SALES_LOG_ABI } from "../lib/registry-abi.ts";
import { REPUTATION_REGISTRY_ABI, TAG_CORPUS_QUALITY, TAG_SOURCE } from "../lib/erc8004.ts";
import { ADDR, ARC, env, appChain, need, transport, txUrl } from "./arc.mjs";

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith("--"));
const BASE = pos[0] ?? env("LOCAL_APP_URL") ?? "http://localhost:9010";
const TASK = pos[1] ?? "0";
const RATE = !argv.includes("--no-rate");
const PATH = "/api/agent/corpus";
const NETWORK = `eip155:${appChain.id}`;

const wallet = privateKeyToAccount(need(env("AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY"));
const AGENT_ID = env("AGENT_ID");
const pub = createPublicClient({ chain: appChain, transport: transport() });

const usdc = await pub.readContract({
  address: ARC.usdc, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [wallet.address],
});

const payer = x402Client.fromConfig({
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(toClientEvmSigner(wallet, pub)) }],
  // Arc's USDC is not one of x402's default assets, so the client refuses to
  // pay in it unless told to. Allowed with a ceiling of 5 cents a pull.
  spendControls: { allowedAssets: [{ network: NETWORK, asset: ARC.usdc, maxAmountPerPayment: "50000" }] },
});
const fetchPaid = wrapFetchWithPayment(fetch, payer);

const url = `${BASE}${PATH}?taskId=${TASK}`;
console.log(`agent     ${wallet.address}${AGENT_ID ? `  ERC-8004 agent #${AGENT_ID}` : ""}  ${formatUnits(usdc, 6)} USDC on ${appChain.name}`);
console.log(`get       ${url}`);

const t0 = Date.now();
const res = await fetchPaid(url, { headers: { accept: "application/json", ...(AGENT_ID ? { "x-erc8004-agent-id": AGENT_ID } : {}) } });
console.log(`status    ${res.status} after ${Date.now() - t0} ms`);

const receipt = res.headers.get("PAYMENT-RESPONSE");
let settlement = null;
if (receipt) {
  settlement = decodePaymentResponseHeader(receipt);
  console.log(`settled   ${settlement.success}  tx ${settlement.transaction}  payer ${settlement.payer ?? "-"}  ${settlement.network}`);
  if (settlement.transaction) console.log(`explorer  ${txUrl(settlement.transaction)}`);
}

const bytes = Buffer.from(await res.arrayBuffer());
if (!res.ok) {
  console.log(bytes.toString("utf8").slice(0, 2000));
  process.exit(1);
}

const body = JSON.parse(bytes.toString("utf8"));
console.log(`corpus    ${body.dataset}: ${body.episodes} episodes, ${body.total_frames} frames, ${body.negatives?.length ?? 0} labelled failures`);

const digest = createHash("sha256").update(bytes).digest("hex");
const claimed = res.headers.get("x-thenar-sha256");
console.log(`sha256    ${digest}${claimed === digest ? "  (the server's figure agrees)" : `  (the server said ${claimed})`}`);
const recognised = res.headers.get("x-thenar-buyer-agent");
console.log(`buyer     ${recognised ? `recognised as ERC-8004 agent #${recognised}` : "not recognised as an agent (no x-erc8004-agent-id, or the payer is not its wallet/owner)"}`);

const audit = res.headers.get("x-thenar-audit");
const logged = audit?.match(/^(0x[0-9a-fA-F]{40})#(\d+)$/);
let agrees = false;
if (!logged || !ADDR.salesLog) {
  console.log(`audit     ${audit ?? "no audit header"}`);
} else {
  // Asked of the contract, not the server.
  const [, contract, seq] = logged;
  const [served, sale] = await Promise.all([
    pub.readContract({ address: contract, abi: SALES_LOG_ABI, functionName: "servedCount", args: [`0x${digest}`] }),
    pub.readContract({ address: contract, abi: SALES_LOG_ABI, functionName: "getSale", args: [BigInt(seq)] }),
  ]);
  agrees = sale.sha256 === `0x${digest}`;
  console.log(
    `audit     SalesLog ${contract} #${seq}: ` +
      (agrees ? "logs the same sha256 as the file received" : `logs a different sha256 (${sale.sha256})`) +
      `; terms ${["x402", "licence", "gateway"][Number(sale.terms)]}; buyerAgent ${sale.buyerAgent === 0n ? "none" : `#${sale.buyerAgent - 1n}`}` +
      `; ${served} sale(s) have served these exact bytes`,
  );
}

if (!RATE) process.exit(0);
let verifierId = env("VERIFIER_AGENT_ID");
if (!verifierId) {
  const arc = await fetch(`${BASE}/api/arc`).then((r) => r.json()).catch(() => null);
  verifierId = arc?.verifier?.agentId ?? null;
}
if (!verifierId || !ARC.reputationRegistry) {
  console.log("rate      skipped: no verifier agent id (VERIFIER_AGENT_ID or /api/arc) or no Reputation Registry");
  process.exit(0);
}
const rating = BigInt(process.env.RATING ?? (agrees ? 100 : 0));
const rater = createWalletClient({ account: wallet, chain: appChain, transport: transport() });
const fb = await rater.writeContract({
  address: ARC.reputationRegistry, abi: REPUTATION_REGISTRY_ABI, functionName: "giveFeedback",
  args: [BigInt(verifierId), rating, 0, TAG_CORPUS_QUALITY, TAG_SOURCE, PATH, "", `0x${digest}`],
});
const r = await pub.waitForTransactionReceipt({ hash: fb });
console.log(`rate      verifier agent #${verifierId}: ${rating}/100 "${TAG_CORPUS_QUALITY}" ${r.status}  ${txUrl(fb)}`);
