import { test } from "node:test";
import assert from "node:assert/strict";
import { noteSynced, trackReceipt } from "../lib/receipt-timers.ts";

/**
 * One timer on Arc: send to receipt is send to final. The `finalized` tag is
 * read right after to check that claim; on Arc it covers the receipt's block,
 * on a fork it trails.
 */
function fakeClient({ receiptBlock = 100n, finalized = 100n, head = 100n, delayMs = 20 } = {}) {
  const calls = [];
  const receipt = { blockNumber: receiptBlock, status: "success", transactionHash: "0xab" };
  return {
    calls,
    waitForTransactionReceipt: async (a) => { calls.push(["wait", a]); await new Promise((r) => setTimeout(r, delayMs)); return receipt; },
    getTransactionReceipt: async () => { calls.push(["get"]); return receipt; },
    getBlock: async ({ blockTag }) => { calls.push(["block", blockTag]); return { number: finalized }; },
    getBlockNumber: async () => head,
  };
}

test("on Arc the receipt is final: one timer, and the finalized tag covers its block", async () => {
  let t = 1_000;
  const c = fakeClient();
  const { receipt, timers } = await trackReceipt(c, "0x01", { sentAt: 1_000, where: "arc", now: () => (t += 250) });
  assert.equal(receipt.blockNumber, 100n);
  assert.equal(timers.where, "arc");
  assert.equal(timers.via, "eth_getTransactionReceipt");
  assert.equal(timers.finalMs, 250);
  assert.equal(timers.finalizedTagCovers, true);
  assert.equal(timers.finalizedLag, 0);
  // Polled faster than Arc's block time, and given a bound.
  const wait = c.calls.find((x) => x[0] === "wait")[1];
  assert.ok(wait.pollingInterval <= 500 && wait.timeout > 0);
});

test("on a fork the finalized tag trails the head, and the timer says so", async () => {
  const c = fakeClient({ receiptBlock: 120n, finalized: 88n, head: 121n });
  const { timers } = await trackReceipt(c, "0x02", { sentAt: 0, where: "fork", now: () => 400 });
  assert.equal(timers.where, "fork");
  assert.equal(timers.finalizedTagCovers, false);
  assert.equal(timers.finalizedLag, 33);
});

test("a receipt the wallet already got from eth_sendRawTransactionSync is timed by the wallet", async () => {
  noteSynced("0xAbC", 5_000, 5_420);
  const c = fakeClient();
  const { timers } = await trackReceipt(c, "0xabc", { sentAt: 0, where: "arc", now: () => 99_999 });
  assert.equal(timers.via, "eth_sendRawTransactionSync");
  assert.equal(timers.finalMs, 420);
  assert.ok(!c.calls.some((x) => x[0] === "wait"), "no polling for a receipt already in hand");
});

test("a node without the finalized tag still gives the timer", async () => {
  const c = fakeClient();
  c.getBlock = async () => { throw new Error("unknown block tag"); };
  const updates = [];
  const { timers } = await trackReceipt(c, "0x03", { sentAt: 0, where: "arc", now: () => 300, onUpdate: (u) => updates.push(u) });
  assert.equal(timers.finalMs, 300);
  assert.equal(timers.finalizedTagCovers, undefined);
  assert.ok(updates.length >= 1);
});
