import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLogs } from "../lib/scan-logs.ts";

/** An endpoint that refuses any range wider than `cap`, like the real ones. */
const endpoint = (cap, logs) => {
  const calls = [];
  const fetchRange = async ({ fromBlock, toBlock }) => {
    calls.push([fromBlock, toBlock]);
    if (toBlock - fromBlock > cap) throw new Error("query returned more than 10000 results");
    return logs.filter((n) => n >= fromBlock && n <= toBlock);
  };
  return { fetchRange, calls };
};

test("a generous endpoint is asked once", async () => {
  const { fetchRange, calls } = endpoint(1_000_000n, [50n, 900n]);
  const got = await scanLogs(fetchRange, { fromBlock: 0n, toBlock: 1000n });
  assert.deepEqual(got, [50n, 900n]);
  assert.equal(calls.length, 1);
});

test("a tight endpoint still returns every log in the range", async () => {
  // An endpoint that refuses above ~10,000 blocks, over a 1,000,000-block history.
  const logs = [5n, 12_345n, 400_000n, 999_999n];
  const { fetchRange } = endpoint(10_000n, logs);
  const got = await scanLogs(fetchRange, { fromBlock: 0n, toBlock: 1_000_000n });
  assert.deepEqual(got.sort((a, b) => Number(a - b)), logs);
});

test("the split narrows until the endpoint accepts it, and no further", async () => {
  const { fetchRange, calls } = endpoint(50_000n, []);
  await scanLogs(fetchRange, { fromBlock: 0n, toBlock: 200_000n });
  const widest = calls
    .filter(([f, t]) => t - f <= 50_000n)
    .reduce((w, [f, t]) => (t - f > w ? t - f : w), 0n);
  assert.ok(widest > 25_000n, `should not split past what is accepted, got ${widest}`);
});

test("a failure that is not about the range is raised, not split forever", async () => {
  let calls = 0;
  const fetchRange = async () => { calls += 1; throw new Error("connection refused"); };
  await assert.rejects(
    () => scanLogs(fetchRange, { fromBlock: 0n, toBlock: 400n }),
    /connection refused/,
  );
  // The whole range, then two halves at the floor, and it stops.
  assert.ok(calls <= 3, `should give up quickly, made ${calls} calls`);
});

test("an empty or inverted range asks nothing", async () => {
  let calls = 0;
  const fetchRange = async () => { calls += 1; return []; };
  assert.deepEqual(await scanLogs(fetchRange, { fromBlock: 10n, toBlock: 9n }), []);
  assert.equal(calls, 0);
});
