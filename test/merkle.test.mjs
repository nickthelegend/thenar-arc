/** The corpus commitment, tested against the module the API and the browser
 *  both use. */
import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
import { leavesOf, rootOf, proofFor, verifyProof } from "../lib/merkle.ts";

const h = (s) => keccak256(toHex(s));
const set = (n) => Array.from({ length: n }, (_, i) => h(`episode-${i}`));

test("the root does not depend on the order rows arrive in", () => {
  const a = set(7);
  const b = [...a].reverse();
  assert.equal(rootOf(a), rootOf(b));
});

test("a duplicate episode cannot change the corpus", () => {
  const a = set(5);
  assert.equal(rootOf(a), rootOf([...a, a[2]]));
});

test("every episode proves into the root", () => {
  for (const n of [1, 2, 3, 5, 8, 13]) {
    const s = set(n);
    const root = rootOf(s);
    for (const leaf of s) {
      const proof = proofFor(s, leaf);
      assert.ok(proof, `no proof for a leaf in a set of ${n}`);
      assert.ok(verifyProof(leaf, proof, root), `leaf failed to verify in a set of ${n}`);
    }
  }
});

test("an episode that is not in the corpus has no proof", () => {
  const s = set(6);
  assert.equal(proofFor(s, h("not-in-it")), null);
});

test("a proof from one corpus does not verify against another", () => {
  const a = set(6);
  const b = set(6).map((_, i) => h(`other-${i}`));
  const proof = proofFor(a, a[0]);
  assert.equal(verifyProof(a[0], proof, rootOf(b)), false);
});

test("adding an episode changes the root", () => {
  const a = set(4);
  assert.notEqual(rootOf(a), rootOf([...a, h("new")]));
});

test("removing an episode changes the root", () => {
  const a = set(4);
  assert.notEqual(rootOf(a), rootOf(a.slice(1)));
});

test("a single-episode corpus is its own root", () => {
  const one = [h("only")];
  assert.equal(rootOf(one), leavesOf(one)[0]);
  assert.ok(verifyProof(one[0], proofFor(one, one[0]), rootOf(one)));
});

test("an empty corpus commits to zero, not to a hash", () => {
  assert.equal(rootOf([]), `0x${"0".repeat(64)}`);
});

test("an odd node is promoted, not paired with itself", () => {
  // Three leaves: the third has no sibling on the bottom layer. If it were
  // duplicated, its proof would contain itself.
  const s = set(3);
  const sorted = leavesOf(s);
  const odd = sorted[2];
  const proof = proofFor(s, odd);
  assert.ok(!proof.includes(odd), "the lone leaf was paired with itself");
  assert.ok(verifyProof(odd, proof, rootOf(s)));
});
