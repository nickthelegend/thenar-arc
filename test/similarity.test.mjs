/** Duplicate detection, against the module the verifier uses. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  pathSignature, signatureDistance, nearestNeighbour, diversityMm,
  DUPLICATE_MM, SIGNATURE_POINTS,
} from "../lib/similarity.ts";

/** A run along a straight line from `a` to `b`, at `hz` for `secs`. */
function line(a, b, { secs = 10, hz = 20, jitter = 0 } = {}) {
  const n = hz * secs;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    return {
      t: +(i / hz).toFixed(3),
      grip: 6,
      object: [
        a[0] + (b[0] - a[0]) * u + (jitter ? Math.sin(i) * jitter : 0),
        a[1] + (b[1] - a[1]) * u,
        0,
      ],
    };
  });
}

test("a signature has a fixed length whatever the run's length", () => {
  assert.equal(pathSignature(line([0, 0], [0.3, 0.3], { secs: 5 })).length, SIGNATURE_POINTS);
  assert.equal(pathSignature(line([0, 0], [0.3, 0.3], { secs: 90 })).length, SIGNATURE_POINTS);
});

test("the same route at a different speed is the same route", () => {
  const slow = line([0.3, 0.2], [0.16, -0.18], { secs: 90 });
  const fast = line([0.3, 0.2], [0.16, -0.18], { secs: 12 });
  const d = signatureDistance(pathSignature(slow), pathSignature(fast));
  assert.ok(d < 1, `same path at different speeds measured ${d.toFixed(2)} mm apart`);
});

test("two genuinely different routes are far apart", () => {
  const a = line([0.3, 0.2], [0.16, -0.18]);
  const b = line([0.1, -0.3], [0.16, -0.18]);
  const d = signatureDistance(pathSignature(a), pathSignature(b));
  assert.ok(d > DUPLICATE_MM * 3, `different routes measured only ${d.toFixed(1)} mm apart`);
});

test("a micrometre of noise does not make a new run", () => {
  const a = line([0.3, 0.2], [0.16, -0.18]);
  const b = line([0.3, 0.2], [0.16, -0.18], { jitter: 0.000001 });
  assert.ok(signatureDistance(pathSignature(a), pathSignature(b)) < DUPLICATE_MM);
});

test("the nearest neighbour names which run it matched", () => {
  const candidate = line([0.3, 0.2], [0.16, -0.18]);
  const near = nearestNeighbour(candidate, [
    { hash: "0xfar", samples: line([0.0, 0.0], [0.05, 0.05]) },
    { hash: "0xnear", samples: line([0.3, 0.2], [0.16, -0.18], { secs: 40 }) },
  ]);
  assert.equal(near.hash, "0xnear");
  assert.ok(near.distanceMm < DUPLICATE_MM);
});

test("nothing to compare against is not a duplicate", () => {
  assert.equal(nearestNeighbour(line([0, 0], [1, 1]), []), null);
});

test("a path that never moved still produces a signature", () => {
  const still = line([0.2, 0.2], [0.2, 0.2]);
  const sig = pathSignature(still);
  assert.equal(sig.length, SIGNATURE_POINTS);
  assert.ok(sig.every((p) => p[0] === 0.2 && p[1] === 0.2));
});

test("an empty recording has no signature to compare", () => {
  assert.deepEqual(pathSignature([]), []);
  assert.equal(signatureDistance([], pathSignature(line([0, 0], [1, 1]))), Infinity);
});

test("diversity is null for a corpus too small to have pairs", () => {
  assert.equal(diversityMm([]), null);
  assert.equal(diversityMm([{ samples: line([0, 0], [1, 1]) }]), null);
});

test("a corpus of copies has almost no diversity", () => {
  const same = { samples: line([0.3, 0.2], [0.16, -0.18]) };
  const d = diversityMm([same, same, same]);
  assert.ok(d < 1, `copies measured ${d} mm apart`);
});

test("a corpus of different routes has more diversity than one of copies", () => {
  const copies = diversityMm([
    { samples: line([0.3, 0.2], [0.16, -0.18]) },
    { samples: line([0.3, 0.2], [0.16, -0.18], { secs: 30 }) },
  ]);
  const varied = diversityMm([
    { samples: line([0.3, 0.2], [0.16, -0.18]) },
    { samples: line([-0.1, 0.3], [0.16, -0.18]) },
  ]);
  assert.ok(varied > copies * 10, `varied ${varied} vs copies ${copies}`);
});
