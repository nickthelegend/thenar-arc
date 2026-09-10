import test from "node:test";
import assert from "node:assert/strict";
import { splitFor } from "../lib/split.ts";

const addr = (i) => "0x" + i.toString(16).padStart(40, "0");

test("the same operator always lands in the same split", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.equal(splitFor(addr(i)), splitFor(addr(i)));
  }
});

test("case does not change an operator's split", () => {
  const a = "0xDf93bdA9B5de2fBf71C2201268DEFf54c1689815";
  assert.equal(splitFor(a), splitFor(a.toLowerCase()));
  assert.equal(splitFor(a), splitFor(a.toUpperCase().replace("0X", "0x")));
});

test("the three splits are all used, and roughly in proportion", () => {
  const counts = { train: 0, val: 0, test: 0 };
  const n = 3000;
  for (let i = 0; i < n; i += 1) counts[splitFor(addr(i))] += 1;
  assert.ok(counts.train > 0 && counts.val > 0 && counts.test > 0);
  // 70/15/15, with room for the sampling noise of 3000 draws.
  assert.ok(Math.abs(counts.train / n - 0.7) < 0.05, `train was ${counts.train / n}`);
  assert.ok(Math.abs(counts.val / n - 0.15) < 0.04, `val was ${counts.val / n}`);
  assert.ok(Math.abs(counts.test / n - 0.15) < 0.04, `test was ${counts.test / n}`);
});
