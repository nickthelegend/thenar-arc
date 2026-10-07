/**
 * The scorer, tested against the module that actually signs.
 *
 *     npm run test:unit
 *
 * Placement is 55% of a run's score and efficiency is 20%, and both used to be
 * read out of the request: the submitter said how close it landed and how long
 * it took, and the verifier signed both. These are the assertions that say it
 * no longer can — written against the real lib/score.ts, so a change that
 * reintroduces either hole fails here rather than being caught later by
 * someone reading a payout that looks too good.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GOAL, GOAL_R, SEAT_OFFSET } from "../lib/bench.ts";
import {
  deviationFromSamples, durationFromSamples, evaluate, placedInRing, TOLERANCE_MM,
} from "../lib/score.ts";

const PAR = 120;

/**
 * A run that carries the payload from a start to `endsAt` and lets go.
 *
 * Shaped like the recorder's own output — 20 Hz, jaws closed through the
 * middle, open at both ends — so the smoothness and grasp terms see something
 * realistic rather than a straight line with one sample.
 */
function run(endsAt, { seconds = 60, second } = {}) {
  const hz = 20;
  const n = hz * seconds;
  const from = [0.30, 0.20];
  const samples = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
    const at = (a, b) => a + (b - a) * e;
    const s = {
      t: +(i / hz).toFixed(3),
      q: [0.1 * e, 0.5 * e, 0.9 * e, 0, 1.2 * e, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [at(from[0], endsAt[0]), at(from[1], endsAt[1]), Math.sin(Math.PI * u) * 0.18],
    };
    if (second) {
      s.object2 = [at(from[0] + 0.05, second[0]), at(from[1], second[1]), Math.sin(Math.PI * u) * 0.18];
    }
    samples.push(s);
  }
  const last = samples[samples.length - 1];
  last.object = [endsAt[0], endsAt[1], 0];
  if (second) last.object2 = [second[0], second[1], 0];
  return samples;
}

/** What a caller submits. `deviationMm` and `durationSeconds` are the claims
 *  under test — neither should reach the score. */
const traj = (samples, claim, success = true, seconds = 60) => ({
  taskId: "0", samples, durationSeconds: seconds, success, deviationMm: claim,
});

test("deviation is measured from where the payload came to rest", () => {
  assert.equal(Math.round(deviationFromSamples(run(GOAL))), 0);
  // 40 mm along x, and nothing else moved.
  assert.equal(Math.round(deviationFromSamples(run([GOAL[0] + 0.04, GOAL[1]]))), 40);
});

test("height is not part of the deviation", () => {
  const samples = run(GOAL);
  samples[samples.length - 1].object = [GOAL[0], GOAL[1], 0.3];
  assert.equal(Math.round(deviationFromSamples(samples)), 0);
});

test("a two-payload scene is measured against its seats, worst first", () => {
  const seatA = [GOAL[0] - SEAT_OFFSET, GOAL[1]];
  const seatB = [GOAL[0] + SEAT_OFFSET, GOAL[1]];
  assert.equal(Math.round(deviationFromSamples(run(seatA, { second: seatB }))), 0);
  // One seated, one 30 mm out: the scene is placed as well as its worst part.
  assert.equal(
    Math.round(deviationFromSamples(run(seatA, { second: [seatB[0] + 0.03, seatB[1]] }))),
    30,
  );
});

test("a claimed deviation cannot buy a placement the samples do not show", () => {
  // The payload finished 60 mm out — inside the ring, far outside the band.
  const samples = run([GOAL[0] + 0.06, GOAL[1]]);

  const honest = evaluate(traj(samples, 60), PAR, 1);
  const lying = evaluate(traj(samples, 0), PAR, 1);

  assert.equal(lying.score, honest.score, "the claim changed the score");
  assert.equal(lying.parts.placement, 0, "60 mm is outside the 25 mm band");
  assert.equal(Math.round(lying.deviationMm), 60, "the verdict reports the measurement");
  assert.equal(lying.raw.claimedDeviationMm, 0, "the claim is kept, and kept separate");
});

test("an honest run is scored exactly as before", () => {
  // 4 mm out: the ordinary case, and the one that must not regress.
  const samples = run([GOAL[0] + 0.004, GOAL[1]]);
  const v = evaluate(traj(samples, 4.3), PAR, 1);
  assert.ok(v.success, "a 4 mm placement is accepted");
  assert.ok(
    Math.abs(v.parts.placement - (1 - 4 / TOLERANCE_MM)) < 0.01,
    `placement ${v.parts.placement} should track the measured 4 mm`,
  );
});

test("success cannot be asserted for a payload outside the ring", () => {
  // 200 mm out: never placed at all, whatever the request says.
  const samples = run([GOAL[0] + 0.2, GOAL[1]]);
  assert.equal(placedInRing(samples), false);

  const v = evaluate(traj(samples, 0), PAR, 1);
  assert.equal(v.success, false);
  assert.equal(v.score, 0, "no term is earned by a run that placed nothing");
});

test("a caller may still report its own failure", () => {
  // Abandoned on the datum. The samples look placed; the operator says it was
  // not a run. That direction stays the caller's to state.
  const v = evaluate(traj(run(GOAL), 0, false), PAR, 1);
  assert.equal(v.success, false);
  assert.equal(v.score, 0);
});

test("the ring and the band are different questions", () => {
  const inRingOutOfBand = run([GOAL[0] + (GOAL_R * 1000 - 10) / 1000, GOAL[1]]);
  assert.equal(placedInRing(inRingOutOfBand), true);
  assert.equal(evaluate(traj(inRingOutOfBand, 0), PAR, 1).parts.placement, 0);
});

test("duration is read off the recording's own clock", () => {
  assert.equal(Math.round(durationFromSamples(run(GOAL, { seconds: 45 }))), 45);
  assert.equal(Math.round(durationFromSamples(run(GOAL, { seconds: 90 }))), 90);
});

test("a claimed duration cannot buy an efficiency the samples do not show", () => {
  // A slow run: 90 s against a 120 s par, submitted as if it took 10.
  const samples = run(GOAL, { seconds: 90 });

  const honest = evaluate(traj(samples, 0, true, 90), PAR, 1);
  const lying = evaluate(traj(samples, 0, true, 10), PAR, 1);

  assert.equal(lying.score, honest.score, "the claim changed the score");
  assert.equal(Math.round(lying.raw.seconds), 90, "the verdict reports the measurement");
  assert.equal(lying.raw.claimedSeconds, 10, "the claim is kept, and kept separate");
});

test("a recording with no clock earns no efficiency", () => {
  // Every timestamp identical: "no time passed" would otherwise read as the
  // fastest run possible and take the term's ceiling.
  const samples = run(GOAL).map((s) => ({ ...s, t: 0 }));
  assert.equal(durationFromSamples(samples), 0);
  assert.equal(evaluate(traj(samples, 0), PAR, 1).parts.efficiency, 0);
});

test("a faster honest run still scores better than a slower one", () => {
  const quick = evaluate(traj(run(GOAL, { seconds: 60 }), 0), PAR, 1);
  const slow = evaluate(traj(run(GOAL, { seconds: 180 }), 0), PAR, 1);
  assert.ok(
    quick.parts.efficiency > slow.parts.efficiency,
    `60 s (${quick.parts.efficiency}) should beat 180 s (${slow.parts.efficiency})`,
  );
});
