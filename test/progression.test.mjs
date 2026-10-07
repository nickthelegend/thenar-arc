import { test } from "node:test";
import assert from "node:assert/strict";
import { progressionByTask, describe as say } from "../lib/progression.ts";

const run = (taskId, score, at, extra = {}) => ({
  taskId, score, at, trajHash: `0x${String(at).padStart(4, "0")}`, ...extra,
});

test("a single run on a task is not a progression", () => {
  assert.equal(progressionByTask([run(1, 9000, 1)]).length, 0);
});

test("runs are differenced oldest first, whatever order they arrive in", () => {
  // The feed hands them back newest first. Differencing in that order reports
  // every improvement as a decline, which is the bug this guards.
  const [p] = progressionByTask([run(1, 9560, 200), run(1, 9340, 100)]);
  assert.deepEqual(p.steps.map((s) => s.run.score), [9340, 9560]);
  assert.equal(p.steps[0].dScore, null);
  assert.equal(p.steps[1].dScore, 220);
  assert.equal(p.net, 220);
});

test("best marks the operator's best run, not the best so far", () => {
  const [p] = progressionByTask([run(1, 9000, 100), run(1, 9500, 200), run(1, 9200, 300)]);
  assert.deepEqual(p.steps.map((s) => s.best), [false, true, false]);
});

test("a decline is reported as a decline", () => {
  const [p] = progressionByTask([run(1, 9500, 100), run(1, 9000, 200)]);
  assert.equal(p.net, -500);
  assert.match(say(p), /down 5\.00/);
});

test("tasks are separate progressions, most-repeated first", () => {
  const rows = [
    run(1, 9000, 100), run(1, 9100, 200), run(1, 9200, 300),
    run(2, 8000, 100), run(2, 8100, 200),
  ];
  const ps = progressionByTask(rows);
  assert.deepEqual(ps.map((p) => p.taskId), [1, 2]);
  assert.deepEqual(ps.map((p) => p.steps.length), [3, 2]);
});

test("a chain-only record differences scores and claims no millimetres", () => {
  const [p] = progressionByTask([run(1, 9340, 100), run(1, 9560, 200)]);
  assert.equal(p.steps[1].dDeviationMm, null);
  assert.equal(p.steps[1].dDurationS, null);
  const s = say(p);
  assert.match(s, /up 2\.20/);
  assert.doesNotMatch(s, /mm|s quicker|s slower/);
});

test("with the ledger's fields it names what changed", () => {
  const [p] = progressionByTask([
    run(1, 9340, 100, { deviationMm: 3.0, durationS: 60 }),
    run(1, 9560, 200, { deviationMm: 2.0, durationS: 62 }),
  ]);
  const s = say(p);
  assert.match(s, /93\.40 to 95\.60 — up 2\.20/);
  assert.match(s, /1\.0 mm closer to the seat/);
  assert.match(s, /2 s slower/);
});

test("no change at all is said plainly rather than as a zero delta", () => {
  const [p] = progressionByTask([run(1, 9000, 100), run(1, 9000, 200)]);
  assert.equal(p.net, 0);
  assert.match(say(p), /90\.00 both times/);
});
