import { test } from "node:test";
import assert from "node:assert/strict";
import { noteSynced, trackReceipt } from "../lib/receipt-timers.ts";

const HASH = "0x" + "ab".repeat(32);

/**
 * A chain that answers on a script. Its clock advances 100 ms per request, so
 * the timers come out in whole steps and the order of events is what is tested.
 */
function chain({ receiptAfter = 2, finalAfter = 4, blockHash = "0xb1", finalHashes = {}, txpool } = {}) {
  let t = 0;
  let calls = 0;
  const step = () => { t += 100; calls += 1; };
  const receipt = (bh = blockHash, n = 7n) => ({ transactionHash: HASH, blockNumber: n, blockHash: bh, status: "success" });
  let receiptReads = 0;
  const client = {
    async request({ method }) {
      step();
      if (method !== "txpool_statusByHash") throw new Error(method);
      return txpool ? txpool(calls) : { status: "Unknown tx hash" };
    },
    async waitForTransactionReceipt() {
      receiptReads += 1;
      // Polls for the receipt, in real time, so a txpool check can run beside it.
      for (let i = 0; i < receiptAfter; i++) { step(); await new Promise((r) => setTimeout(r, 60)); }
      return receiptReads === 1 ? receipt() : receipt("0xb2", 8n);
    },
    async getTransactionReceipt() { step(); return receipt(); },
    async getBlockNumber() { step(); return 11n; },
    async getBlock({ blockTag, blockNumber }) {
      step();
      if (blockTag === "finalized") {
        const n = calls >= finalAfter ? 9n : 6n;
        return { number: n, hash: "0xf" };
      }
      return { number: blockNumber, hash: finalHashes[String(blockNumber)] ?? blockHash };
    },
  };
  return { client, now: () => t };
}

test("executed comes before final, both from the moment the transaction was sent", async () => {
  const { client, now } = chain();
  const updates = [];
  const tracked = await trackReceipt(client, HASH, { sentAt: 0, where: "local", now, onUpdate: (u) => updates.push(u) });
  assert.equal(tracked.timers.finalMs, undefined, "the receipt comes back before finality");
  const { timers } = await tracked.final;
  assert.equal(timers.via, "eth_getTransactionReceipt");
  assert.equal(timers.finalizedLag, 5, "the gap between the head and the finalized tag is measured");
  assert.ok(timers.executedMs > 0);
  assert.ok(timers.finalMs > timers.executedMs);
  assert.equal(timers.blockNumber, 7n);
  assert.equal(timers.moved, undefined);
  assert.ok(updates[0].executedMs !== undefined && updates[0].finalMs === undefined, "executed is reported before final");
});

test("a receipt whose block lost to another proposal is read again before it is called final", async () => {
  const { client, now } = chain({ finalHashes: { 7: "0xother", 8: "0xb2" }, blockHash: "0xb1" });
  const { receipt, timers } = await (await trackReceipt(client, HASH, { sentAt: 0, where: "monad", now })).final;
  assert.equal(timers.moved, true);
  assert.equal(receipt.blockHash, "0xb2");
  assert.equal(timers.blockNumber, 8n);
  assert.ok(timers.finalMs !== undefined);
});

test("on Monad the node is asked whether it holds the transaction while the receipt is outstanding", async () => {
  const { client, now } = chain({ receiptAfter: 6, txpool: (n) => (n > 2 ? { status: "pending" } : "Unknown tx hash") });
  const { timers } = await (await trackReceipt(client, HASH, { sentAt: 0, where: "monad", now })).final;
  assert.equal(timers.seen?.status, "pending");
  assert.ok(timers.seen.ms <= timers.executedMs);
});

test("a receipt the wallet already got from eth_sendRawTransactionSync is timed by the wallet", async () => {
  const { client, now } = chain();
  noteSynced(HASH, 1000, 1004);
  const { timers } = await trackReceipt(client, HASH, { sentAt: 50_000, where: "local", now: () => now() + 1000 });
  assert.equal(timers.via, "eth_sendRawTransactionSync");
  assert.equal(timers.executedMs, 4);
});

test("a block that never finalizes is reported as such, not as final", async () => {
  const { client, now } = chain({ finalAfter: Infinity });
  const { timers } = await (await trackReceipt(client, "0x" + "cd".repeat(32), { sentAt: 0, where: "local", now, finalWithinMs: 600 })).final;
  assert.equal(timers.timedOut, true);
  assert.equal(timers.finalMs, undefined);
});
