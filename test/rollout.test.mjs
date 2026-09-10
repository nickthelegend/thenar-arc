/**
 * The evaluator a policy leaderboard is judged by.
 *
 * The shipped policy is the fixture, because a rollout harness that agrees
 * with itself and disagrees with the model actually on the site would rank
 * submissions against nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePolicy, shapeError, STARTS, ARCH } from "../lib/rollout.ts";

const P = JSON.parse(readFileSync("public/policy.json", "utf8"));

test("the shipped policy passes the shape check", () => {
  assert.equal(shapeError(P), null);
});

test("the shipped policy reproduces its published rollout", () => {
  const e = evaluatePolicy(P);
  assert.equal(e.starts, STARTS.length);
  // policy.json records what this rollout produced when it was trained. The
  // module and the file have to agree or one of them is describing a different
  // model from the one being served.
  assert.equal(e.grasped, P.rollout.grasped, `grasped ${e.grasped} vs published ${P.rollout.grasped}`);
  assert.equal(e.placed, P.rollout.placedAndReleased,
    `placed ${e.placed} vs published ${P.rollout.placedAndReleased}`);
});

test("evaluation is deterministic", () => {
  const a = evaluatePolicy(P);
  const b = evaluatePolicy(P);
  assert.deepEqual(a.perStart, b.perStart);
});

test("a policy of the wrong shape is refused with the reason", () => {
  assert.match(shapeError({}), /mean must be/);
  assert.match(shapeError({ ...P, b1: [1, 2] }), /b1 must be/);
  assert.match(shapeError({ ...P, W2: [] }), /W2 must be/);
  assert.match(shapeError({ ...P, std: P.std.map(() => 0) }), /std must not contain a zero/);
  assert.match(shapeError({ ...P, mean: P.mean.map(() => NaN) }), /mean must be/);
});

test("a policy that does nothing grasps nothing", () => {
  // All weights zero: every action is the bias, which is zero, so the tool
  // never moves and the jaws never close.
  const zero = {
    mean: new Array(ARCH.in).fill(0), std: new Array(ARCH.in).fill(1),
    W1: Array.from({ length: ARCH.hidden }, () => new Array(ARCH.in).fill(0)),
    b1: new Array(ARCH.hidden).fill(0),
    W2: Array.from({ length: ARCH.hidden }, () => new Array(ARCH.hidden).fill(0)),
    b2: new Array(ARCH.hidden).fill(0),
    W3: Array.from({ length: ARCH.out }, () => new Array(ARCH.hidden).fill(0)),
    b3: new Array(ARCH.out).fill(0),
  };
  assert.equal(shapeError(zero), null);
  const e = evaluatePolicy(zero);
  assert.equal(e.grasped, 0);
  assert.equal(e.placed, 0);
});

test("a policy that emits enormous actions is bounded, not NaN", () => {
  const wild = {
    mean: new Array(ARCH.in).fill(0), std: new Array(ARCH.in).fill(1),
    W1: Array.from({ length: ARCH.hidden }, () => new Array(ARCH.in).fill(1e6)),
    b1: new Array(ARCH.hidden).fill(1e6),
    W2: Array.from({ length: ARCH.hidden }, () => new Array(ARCH.hidden).fill(1e6)),
    b2: new Array(ARCH.hidden).fill(1e6),
    W3: Array.from({ length: ARCH.out }, () => new Array(ARCH.hidden).fill(1e6)),
    b3: new Array(ARCH.out).fill(1e6),
  };
  const e = evaluatePolicy(wild);
  assert.equal(e.placed, 0);
  assert.ok(e.perStart.every((r) => !Number.isNaN(r.devMm)), "a deviation came back NaN");
});
