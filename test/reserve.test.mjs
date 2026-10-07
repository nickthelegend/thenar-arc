import { test } from "node:test";
import assert from "node:assert/strict";
import { RESERVE_WEI, isDelegated, reserveCheck } from "../lib/reserve.ts";
import { gasLimitFrom } from "../lib/monad-gas.ts";

const MON = 10n ** 18n;

test("a transaction that moves no MON is never held to the reserve", () => {
  const v = reserveCheck({ balanceWei: 1n * MON, valueWei: 0n, maxGasCostWei: MON / 100n, delegated: true });
  assert.equal(v.ok, true);
  assert.equal(v.kind, "no-value");
});

test("a value spend that leaves 10 MON behind is fine, delegated or not", () => {
  for (const delegated of [false, true]) {
    const v = reserveCheck({ balanceWei: 25n * MON, valueWei: 14n * MON, maxGasCostWei: MON / 100n, delegated });
    assert.equal(v.kind, "above-reserve");
    assert.ok(v.leftWei >= RESERVE_WEI);
  }
});

test("an ordinary account may empty itself once", () => {
  const v = reserveCheck({ balanceWei: 5n * MON, valueWei: 4n * MON, maxGasCostWei: MON / 100n, delegated: false });
  assert.equal(v.ok, true);
  assert.equal(v.kind, "emptying");
  assert.match(v.note, /three blocks/);
});

test("a delegated account cannot dip below the reserve: the send would revert and still pay gas", () => {
  const v = reserveCheck({ balanceWei: 12n * MON, valueWei: 3n * MON, maxGasCostWei: MON / 100n, delegated: true });
  assert.equal(v.ok, false);
  assert.equal(v.kind, "delegated-below-reserve");
  assert.match(v.note, /7702/);
});

test("the gas cost counts against what is left", () => {
  // 10.5 MON, sending 0.4: fine on its own, but a 0.2 MON gas ceiling takes it under.
  const v = reserveCheck({ balanceWei: 105n * MON / 10n, valueWei: 4n * MON / 10n, maxGasCostWei: 2n * MON / 10n, delegated: true });
  assert.equal(v.ok, false);
});

test("delegated code is recognised by its 0xef0100 prefix", () => {
  assert.equal(isDelegated("0xef0100" + "ab".repeat(20)), true);
  assert.equal(isDelegated("0x6080"), false);
  assert.equal(isDelegated("0x"), false);
  assert.equal(isDelegated(undefined), false);
});

test("an explicit limit is the node's estimate plus a tenth, rounded up", () => {
  assert.equal(gasLimitFrom(100_000n), 110_000n);
  assert.equal(gasLimitFrom(21_001n), 23_102n);
  assert.equal(gasLimitFrom(0n), 0n);
});
