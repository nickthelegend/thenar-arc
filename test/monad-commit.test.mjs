import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PIPELINE, KEEP_HEIGHTS, applyHead, cadence, median, parseHead } from "../lib/monad-commit.ts";

const head = (number, commitState, blockId = `b${number}`) => ({ blockId, number, commitState });
const run = (msgs) => msgs.reduce((p, [h, t]) => applyHead(p, h, t), EMPTY_PIPELINE);

test("a block's latencies are measured from when it was proposed", () => {
  const p = run([
    [head(10, "Proposed"), 1000],
    [head(10, "Voted"), 1290],
    [head(10, "Finalized"), 1580],
    [head(10, "Verified"), 2470],
  ]);
  assert.equal(p.blocks.length, 1);
  assert.equal(p.blocks[0].state, "Verified");
  assert.deepEqual(p.latencies, { Voted: [290], Finalized: [580], Verified: [1470] });
});

test("a block may skip Voted and go straight to Finalized", () => {
  const p = run([[head(7, "Proposed"), 0], [head(7, "Finalized"), 610]]);
  assert.equal(p.blocks[0].state, "Finalized");
  assert.deepEqual(p.latencies.Voted, []);
  assert.deepEqual(p.latencies.Finalized, [610]);
});

test("a late or repeated state never moves a block backwards or re-counts it", () => {
  const p = run([
    [head(3, "Proposed"), 0],
    [head(3, "Finalized"), 500],
    [head(3, "Voted"), 520],
    [head(3, "Finalized"), 900],
  ]);
  assert.equal(p.blocks[0].state, "Finalized");
  assert.deepEqual(p.latencies.Finalized, [500]);
  assert.deepEqual(p.latencies.Voted, [520]);
});

test("when a height finalizes, the competing proposals at that height are dropped", () => {
  const p = run([
    [head(20, "Proposed", "a"), 0],
    [head(20, "Proposed", "b"), 40],
    [head(21, "Proposed", "c"), 300],
    [head(20, "Finalized", "b"), 600],
  ]);
  assert.deepEqual(p.blocks.map((b) => b.blockId), ["c", "b"]);
  assert.equal(p.abandoned, 1);
  // The second proposal at a height is not a new block arrival.
  assert.deepEqual(p.arrivals.map(([n]) => n), [20, 21]);
});

test("a block first seen mid-pipeline is drawn but kept out of the latencies", () => {
  const p = run([[head(5, "Voted"), 0], [head(5, "Finalized"), 280]]);
  assert.equal(p.blocks[0].fromProposed, false);
  assert.deepEqual(p.latencies, { Voted: [], Finalized: [], Verified: [] });
});

test("only the newest heights are kept", () => {
  const msgs = Array.from({ length: 30 }, (_, i) => [head(100 + i, "Proposed"), i * 300]);
  const p = run(msgs);
  assert.equal(new Set(p.blocks.map((b) => b.number)).size, KEEP_HEIGHTS);
  assert.equal(p.blocks[0].number, 129);
  assert.equal(p.messages, 30);
});

test("cadence is the span over the heights it covers", () => {
  const msgs = Array.from({ length: 11 }, (_, i) => [head(i, "Proposed"), i * 300 + (i % 2 ? 40 : -40)]);
  assert.equal(cadence(run(msgs.slice(0, 3))), null);
  assert.equal(Math.round(cadence(run(msgs))), 300);
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("parseHead decodes a monadNewHeads payload and refuses anything else", () => {
  const h = parseHead({ blockId: "0xab", number: "0x41d5edc", commitState: "Voted", hash: "0x5c", gasUsed: "0x190e40", gasLimit: "0x8f0d180" });
  assert.deepEqual(h, { blockId: "0xab", number: 69033692, commitState: "Voted", hash: "0x5c", gasUsed: 1642048, gasLimit: 150_000_000 });
  assert.equal(parseHead({ blockId: "0xab", number: "0x1", commitState: "Pending" }), null);
  assert.equal(parseHead({ number: "0x1", commitState: "Voted" }), null);
  assert.equal(parseHead("0x1"), null);
});
