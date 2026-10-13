import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBest, sampleAt, raceSampleAt } from "../lib/race.ts";

const run = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.05, i }));

test("sampleAt returns the last sample at or before the moment, clamped", () => {
  assert.equal(sampleAt([], 1), null);
  assert.equal(sampleAt(run, -1).i, 0);
  assert.equal(sampleAt(run, 0).i, 0);
  assert.equal(sampleAt(run, 0.07).i, 1);
  assert.equal(sampleAt(run, 0.1).i, 2);
  assert.equal(sampleAt(run, 2.4999).i, 49);
  assert.equal(sampleAt(run, 99).i, 99);
});

test("the run to race is the best score, and of equals the quicker", () => {
  const rows = [
    { traj_hash: "a", score: 8800, duration_s: 9 },
    { traj_hash: "b", score: 9682, duration_s: 9.8 },
    { traj_hash: "c", score: 9682, duration_s: 9.1 },
  ];
  assert.equal(pickBest(rows).traj_hash, "c");
  assert.equal(pickBest([]), null);
});


test("a ghost enabled mid-run seeks the operator's clock and holds it when stopped", () => {
  const recording = [{t:10,pose:"start"},{t:12,pose:"middle"},{t:14,pose:"end"}];
  assert.equal(raceSampleAt(recording, 3).pose, "middle");
  // Re-reading a paused/completed clock never advances the recording.
  assert.equal(raceSampleAt(recording, 3).pose, "middle");
  assert.equal(raceSampleAt(recording, 0).pose, "start");
  assert.equal(raceSampleAt(recording, 99).pose, "end");
  assert.equal(raceSampleAt([], 1), null);
});
