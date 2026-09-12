/**
 * An agent buying one task's corpus, for real.
 *
 * One key does both jobs. AGENT_PRIVATE_KEY signs the AgentKit challenge for
 * World Chain, and it is also the key of Hedera account HEDERA_AGENT_ID
 * (created by scripts/hedera-setup.mjs with that key as its alias), so it signs
 * the HBAR transfer x402 settles.
 *
 * The request goes through AgentKit first. If AgentBook maps this wallet to a
 * verified human with free pulls left, the corpus comes back and nothing moves.
 * Otherwise the server answers 402 again, and the x402 wrapper pays on Hedera,
 * with Blocky402 submitting the transfer and paying its fee.
 *
 *   node scripts/agent-buy.mjs [baseUrl] [taskId]
 */
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { createAgentkitClient } from "@worldcoin/agentkit";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const TASK = process.argv[3] ?? "1";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
);
for (const k of ["AGENT_PRIVATE_KEY", "HEDERA_AGENT_ID"]) {
  if (!env[k]) throw new Error(`${k} is missing from .env.local`);
}

const wallet = privateKeyToAccount(env.AGENT_PRIVATE_KEY);

const agentkit = createAgentkitClient({
  signer: {
    address: wallet.address,
    chainId: "eip155:480",
    type: "eip191",
    signMessage: (message) => wallet.signMessage({ message }),
  },
  onEvent: (e) =>
    console.log(`agentkit  ${e.type}${e.reason ? `: ${e.reason}` : ""}${e.status ? ` -> ${e.status}` : ""}`),
});

const payer = x402Client.fromConfig({
  schemes: [
    {
      network: "hedera:testnet",
      client: new ExactHederaScheme(
        createClientHederaSigner(
          env.HEDERA_AGENT_ID,
          PrivateKey.fromStringECDSA(env.AGENT_PRIVATE_KEY.replace(/^0x/, "")),
          { network: "hedera:testnet" },
        ),
      ),
    },
  ],
  // HBAR is not one of x402's default assets, so the client refuses to pay in
  // it unless told to. Allowed here with a ceiling of one HBAR per pull.
  spendControls: {
    allowedAssets: [{ network: "hedera:testnet", asset: "0.0.0", maxAmountPerPayment: "100000000" }],
  },
});

const fetchPaid = wrapFetchWithPayment(agentkit.fetch, payer);

const url = `${BASE}/api/agent/corpus?taskId=${TASK}`;
console.log(`agent     ${wallet.address}  hedera ${env.HEDERA_AGENT_ID}`);
console.log(`get       ${url}`);

const t0 = Date.now();
const res = await fetchPaid(url, { headers: { accept: "application/json" } });
console.log(`status    ${res.status} after ${Date.now() - t0} ms`);

const receipt = res.headers.get("PAYMENT-RESPONSE");
if (receipt) {
  const s = decodePaymentResponseHeader(receipt);
  console.log(`settled   ${s.success}  tx ${s.transaction}  payer ${s.payer ?? "-"}  ${s.network}`);
  const [acct, when] = String(s.transaction).split("@");
  if (when) console.log(`hashscan  https://hashscan.io/testnet/transaction/${acct}-${when.replace(".", "-")}`);
} else if (res.ok) {
  console.log("settled   nothing: AgentKit granted this pull");
}

const body = await res.json().catch(() => null);
if (!res.ok) {
  console.log(JSON.stringify(body, null, 2)?.slice(0, 2000));
  process.exit(1);
}
console.log(
  `corpus    ${body.dataset}: ${body.episodes} episodes, ${body.total_frames} frames, ` +
    `${body.negatives.length} labelled failures`,
);
