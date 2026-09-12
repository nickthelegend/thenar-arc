import { test } from "node:test";
import assert from "node:assert/strict";
import { wouldHavePaid, wouldHavePaidSentence, belowFloorBy } from "../lib/shortfall.ts";
import { ACCEPT_FLOOR, W_PLACEMENT, W_EFFICIENCY, W_SMOOTHNESS, TOLERANCE_MM } from "../lib/score.ts";

const verdict = (parts, score, success = false) => ({
  score, success, deviationMm: 0, parts,
  raw: { meanJerk: 0, seconds: 0, grasps: 1 }, payoutMon: 0,
});

/** Score as evaluate() computes it, with no penalty. */
const unit = (p) => Math.round((p.placement * W_PLACEMENT + p.efficiency * W_EFFICIENCY + p.smoothness * W_SMOOTHNESS) * 10000);

test("an accepted run has nothing to answer", () => {
  const p = { placement: 0.9, efficiency: 1, smoothness: 1 };
  assert.equal(wouldHavePaid(verdict(p, unit(p), true), 120), null);
});

test("the placement it names would in fact have reached the floor", () => {
  const p = { placement: 0.2, efficiency: 0.9, smoothness: 0.6 };
  const v = verdict(p, unit(p), false);
  const w = wouldHavePaid(v, 120);
  assert.ok(w.deviationMm !== null);
  // Feed the named deviation back through the scoring and check it clears.
  const placement = 1 - w.deviationMm / TOLERANCE_MM;
  const again = unit({ ...p, placement });
  assert.ok(again >= ACCEPT_FLOOR - 1, `${again} should reach ${ACCEPT_FLOOR}`);
});

test("a term that cannot reach the floor alone is named as null, not as a number", () => {
  // Placement is 55% of the score; with the other two at zero it cannot carry
  // a run to 40.00 on its own... but it can: 0.55 > 0.40. Smoothness cannot.
  const p = { placement: 0.1, efficiency: 0, smoothness: 0 };
  const w = wouldHavePaid(verdict(p, unit(p), false), 120);
  assert.equal(w.jerk, null, "25% cannot carry a 40% floor");
  assert.equal(w.seconds, null, "20% cannot either");
  assert.ok(w.deviationMm !== null, "55% can");
});

test("a run that never reached the ring is not given a target", () => {
  const w = wouldHavePaid(verdict({ placement: 0, efficiency: 0, smoothness: 0 }, 0, false), 120);
  assert.equal(w.deviationMm, null);
  assert.equal(w.needsMoreThanOne, true);
  assert.match(wouldHavePaidSentence(w), /No single change/);
});

test("a run already at full marks for time is not told to be quicker", () => {
  const p = { placement: 0.3, efficiency: 1, smoothness: 0.5 };
  const w = wouldHavePaid(verdict(p, unit(p), false), 120);
  assert.equal(w.seconds, null);
});

test("the sentence names every term that could carry it, and only those", () => {
  const p = { placement: 0.5, efficiency: 0.5, smoothness: 0.5 };
  const w = wouldHavePaid(verdict(p, unit(p), false), 120);
  const s = wouldHavePaidSentence(w);
  if (w.deviationMm !== null) assert.match(s, /mm of the seat/);
  if (w.jerk === null) assert.doesNotMatch(s, /mean jerk/);
});

test("belowFloorBy still reports the gap in points", () => {
  assert.equal(belowFloorBy(verdict({ placement: 0, efficiency: 0, smoothness: 0 }, 3500, false)), 500);
});
