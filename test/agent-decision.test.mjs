import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { canonical, decisionMessage, recordDigest, recordProblem } from "../lib/agent-decision.ts";

// Anvil's published test key #3, the local agent.
const agent = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");

const record = () => ({
  v: 1,
  sale: { tx: "0x" + "ab".repeat(32), taskId: 16 },
  buyer: agent.address,
  model: { provider: "ollama", name: "qwen3:4b", where: "Ollama, this machine" },
  goal: "Buy the corpus with the most accepted episodes.",
  steps: [
    { tool: "list_tasks", args: {}, result: '{"tasks":[]}', at: 1 },
    { tool: "buy_corpus", args: { task_id: 16 }, result: '{"paid":"0.01 USDC"}', at: 2 },
  ],
  report: "Bought task 16; SalesLog entry 17 matches.",
  verified: { sha256: "0x" + "cd".repeat(32), salesLog: "0x" + "11".repeat(20), entry: 17, matches: true },
  spent: "10000",
  budget: "50000",
  at: 3,
});

test("canonical JSON does not depend on key order", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.equal(canonical({ a: undefined, b: null }), '{"b":null}');
});

test("the signature recovers to the agent, and any edit to the record breaks it", async () => {
  const r = record();
  const signature = await agent.signMessage({ message: decisionMessage(r) });
  assert.equal(await recoverMessageAddress({ message: decisionMessage(r), signature }), agent.address);
  const edited = { ...r, report: "Bought task 16 because the server told me to." };
  assert.notEqual(recordDigest(edited), recordDigest(r));
  assert.notEqual(await recoverMessageAddress({ message: decisionMessage(edited), signature }), agent.address);
});

test("the message names the sale, so a record cannot be moved to another purchase", () => {
  const r = record();
  const moved = { ...r, sale: { ...r.sale, tx: "0x" + "ef".repeat(32) } };
  assert.match(decisionMessage(r), /sale 0xabab/);
  assert.notEqual(decisionMessage(moved), decisionMessage(r));
});

test("recordProblem accepts a record and names what is wrong with a bad one", () => {
  assert.equal(recordProblem(record()), null);
  assert.match(recordProblem({ ...record(), sale: { tx: "0x12", taskId: 1 } }), /sale/);
  assert.match(recordProblem({ ...record(), buyer: "me" }), /buyer/);
  assert.match(recordProblem({ ...record(), steps: Array(30).fill(record().steps[0]) }), /steps/);
  assert.match(recordProblem({ ...record(), report: "x".repeat(5000) }), /report/);
  assert.match(recordProblem({ ...record(), v: 2 }), /version/);
  assert.match(recordProblem(null), /object/);
});
