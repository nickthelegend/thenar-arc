import { keccak256, concat, type Hex } from "viem";

/**
 * A commitment to exactly which episodes a corpus contains.
 *
 * A buyer downloads a task's corpus and gets a file. Nothing in that file says
 * it is the whole corpus: an episode could be missing, and the only way to
 * notice would be to count against a number the same server told you. The
 * contract already holds each run's hash one at a time, which proves every
 * episode is real and proves nothing about the set — you cannot tell from the
 * chain whether you were handed all of them.
 *
 * So the set gets a hash of its own, committed once, and any single episode
 * can be proved to belong to it without downloading the rest.
 *
 * Pairs are sorted before hashing, which is the OpenZeppelin convention and
 * the reason a proof is just a list of siblings with no left/right flags: the
 * verifier re-derives the ordering from the values themselves. An odd node is
 * promoted rather than duplicated — duplicating it is the second-preimage
 * mistake that lets a proof for one leaf pass for a tree it was not in.
 */

const sortPair = (a: Hex, b: Hex): Hex =>
  (BigInt(a) < BigInt(b) ? concat([a, b]) : concat([b, a])) as Hex;

const hashPair = (a: Hex, b: Hex): Hex => keccak256(sortPair(a, b));

/**
 * Leaves in the order they will be committed.
 *
 * Sorted, so the root does not depend on the order rows came back from a
 * database. Two servers with the same episodes must produce the same root or
 * the commitment proves nothing.
 */
export function leavesOf(episodeHashes: string[]): Hex[] {
  return [...new Set(episodeHashes.map((h) => h.toLowerCase() as Hex))].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
  );
}

/** The layers, bottom up. The last layer is the single root. */
function layersOf(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) return [[]];
  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const below = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < below.length; i += 2) {
      // An odd one out is carried up untouched rather than paired with itself.
      next.push(i + 1 < below.length ? hashPair(below[i], below[i + 1]) : below[i]);
    }
    layers.push(next);
  }
  return layers;
}

/** The commitment for a set of episode hashes. Zero for an empty corpus, which
 *  a caller should refuse to commit rather than treat as a root. */
export function rootOf(episodeHashes: string[]): Hex {
  const leaves = leavesOf(episodeHashes);
  if (leaves.length === 0) return `0x${"0".repeat(64)}` as Hex;
  const layers = layersOf(leaves);
  return layers[layers.length - 1][0];
}

/** The siblings needed to walk one episode up to the root. Null when the
 *  episode is not in the set — which is the answer, not an error. */
export function proofFor(episodeHashes: string[], target: string): Hex[] | null {
  const leaves = leavesOf(episodeHashes);
  const want = target.toLowerCase() as Hex;
  let index = leaves.findIndex((l) => l === want);
  if (index < 0) return null;

  const layers = layersOf(leaves);
  const proof: Hex[] = [];
  for (let l = 0; l < layers.length - 1; l += 1) {
    const layer = layers[l];
    const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
    // No sibling means this node was promoted; nothing to add at this level.
    if (pairIndex < layer.length) proof.push(layer[pairIndex]);
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Walk a leaf up its proof and see where it lands. The whole point is that
 *  this runs in the reader's browser against a root read from the chain. */
export function verifyProof(leaf: string, proof: Hex[], root: string): boolean {
  let node = leaf.toLowerCase() as Hex;
  for (const sibling of proof) node = hashPair(node, sibling);
  return node.toLowerCase() === root.toLowerCase();
}
