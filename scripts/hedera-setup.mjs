/**
 * The Hedera side of the corpus paywall, created once: two accounts and a topic.
 *
 * The buyer is the agent's own key. AGENT_PRIVATE_KEY is the secp256k1 key
 * whose address signs AgentKit challenges for World Chain; an ECDSA Hedera
 * account created with that key as its alias pays from the same key. So the
 * identity that proves a human stands behind the agent and the account that
 * pays when none does are one key, not two wallets that merely claim to be
 * related.
 *
 * The seller is a fresh account that holds nothing but what the corpus earns.
 *
 * The topic is the sales log: a Consensus Service topic only the treasury's key
 * can post to, so every message on it is the seller's own statement of what it
 * served, in an order nobody can rewrite afterwards.
 *
 * Funded from an existing testnet operator. Safe to re-run: anything already
 * recorded in .env.local is reported, not created twice.
 *
 *   HEDERA_OPERATOR_ENV=/path/to/.env node scripts/hedera-setup.mjs
 */
import { readFileSync, appendFileSync } from "node:fs";
import {
  AccountBalanceQuery, AccountCreateTransaction, Client, Hbar, PrivateKey, TopicCreateTransaction,
} from "@hashgraph/sdk";

const parse = (file) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
  );

const ecdsa = (hex) => PrivateKey.fromStringECDSA(hex.replace(/^0x/, ""));

const local = parse(".env.local");
const op = process.env.HEDERA_OPERATOR_ENV ? parse(process.env.HEDERA_OPERATOR_ENV) : process.env;
if (!op.HEDERA_OPERATOR_ID || !op.HEDERA_OPERATOR_KEY) {
  throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required, or HEDERA_OPERATOR_ENV naming a file that has them");
}
if (!local.AGENT_PRIVATE_KEY) throw new Error("AGENT_PRIVATE_KEY is missing from .env.local");

const client = Client.forTestnet().setOperator(op.HEDERA_OPERATOR_ID, ecdsa(op.HEDERA_OPERATOR_KEY));

async function create(key, hbar) {
  const tx = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key.publicKey)
    .setInitialBalance(new Hbar(hbar))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  return { id: receipt.accountId.toString(), tx: tx.transactionId.toString() };
}

// Recorded one at a time, straight after each receipt: if a later step fails,
// a re-run must not try to create an earlier one again under an alias that is
// already taken.
let agentId = local.HEDERA_AGENT_ID;
if (!agentId) {
  const key = ecdsa(local.AGENT_PRIVATE_KEY);
  const a = await create(key, 40);
  appendFileSync(".env.local", `\nHEDERA_AGENT_ID=${a.id}\n`);
  agentId = a.id;
  console.log(`agent    ${a.id}  alias 0x${key.publicKey.toEvmAddress()}  tx ${a.tx}`);
} else {
  console.log(`agent    ${agentId}  already recorded`);
}

let treasuryId = local.HEDERA_TREASURY_ID;
let treasuryKey = local.HEDERA_TREASURY_KEY ? ecdsa(local.HEDERA_TREASURY_KEY) : null;
if (!treasuryId) {
  const key = PrivateKey.generateECDSA();
  const t = await create(key, 1);
  appendFileSync(".env.local", `HEDERA_TREASURY_ID=${t.id}\nHEDERA_TREASURY_KEY=0x${key.toStringRaw()}\n`);
  treasuryId = t.id;
  treasuryKey = key;
  console.log(`treasury ${t.id}  tx ${t.tx}`);
} else {
  console.log(`treasury ${treasuryId}  already recorded`);
}

let topicId = local.HEDERA_SALES_TOPIC_ID;
if (!topicId) {
  if (!treasuryKey) {
    throw new Error("HEDERA_TREASURY_KEY is missing from .env.local, and the sales topic's submit key is the treasury's");
  }
  const tx = await new TopicCreateTransaction()
    .setTopicMemo("Thenar corpus sales: one message per pull, with the sha256 of the file served")
    .setSubmitKey(treasuryKey.publicKey)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId.toString();
  appendFileSync(".env.local", `HEDERA_SALES_TOPIC_ID=${topicId}\n`);
  console.log(`topic    ${topicId}  tx ${tx.transactionId.toString()}`);
} else {
  console.log(`topic    ${topicId}  already recorded`);
}

for (const [label, id] of [["agent", agentId], ["treasury", treasuryId]]) {
  const b = await new AccountBalanceQuery().setAccountId(id).execute(client);
  console.log(`${label.padEnd(8)} ${id}  ${b.hbars.toString()}`);
}
client.close();
