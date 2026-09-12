/**
 * An agent buying one task's corpus, for real, and checking what it bought.
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
 * Then it hashes the bytes it received and reads the seller's sales topic on
 * Hedera's mirror node, which is not the seller's server, to see whether the
 * sale was logged with that same hash.
 *
 *   node scripts/agent-buy.mjs [baseUrl] [taskId]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { createAgentkitClient } from "@worldcoin/agentkit";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const TASK = process.argv[3] ?? "1";
const MIRROR = "https://testnet.mirrornode.hedera.com";

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
const logged = audit?.match(/^(0\.0\.\d+)#(\d+)$/);
if (!logged) {
  console.log(`audit     ${audit ?? "no audit header"}`);
  process.exit(0);
}

// The mirror node trails consensus by a few seconds.
const [, topic, seq] = logged;
let message = null;
for (let i = 0; i < 15 && !message; i += 1) {
  const r = await fetch(`${MIRROR}/api/v1/topics/${topic}/messages/${seq}`);
  if (r.ok) message = await r.json();
  else await new Promise((ok) => setTimeout(ok, 2000));
}
if (!message) {
  console.log(`audit     ${topic} #${seq} is not on the mirror node yet`);
  process.exit(0);
}
const entry = JSON.parse(Buffer.from(message.message, "base64").toString("utf8"));
console.log(
  `audit     topic ${topic} #${seq} at consensus ${message.consensus_timestamp}: ` +
    (entry.sha256 === digest ? "logs the same sha256 as the file received" : `logs a different sha256 (${entry.sha256})`),
);
console.log(`mirror    ${MIRROR}/api/v1/topics/${topic}/messages/${seq}`);
