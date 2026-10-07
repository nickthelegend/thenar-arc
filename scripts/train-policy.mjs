/**
 * Train a policy on the trajectories this protocol actually paid for.
 *
 * "Trained policy demo" was on the rejected list because there was no trained
 * policy and showing one would be a lie. That was true when the corpus was
 * empty. It is not a reason not to train one now that thirty-five real
 * demonstrations exist — and the whole thesis of this project is that a corpus
 * collected this way is worth training on, which is a claim best answered by
 * doing it rather than asserting it.
 *
 * Behaviour cloning, deliberately small. The state is what an operator can see
 * and the action is what an operator does: no privileged information, no
 * reward, no simulator in the loop. If it works it works because the
 * demonstrations contained the behaviour.
 *
 * Written without a framework so the result is a few matrices anyone can read,
 * and so the thing that ships to the browser is arithmetic rather than a
 * runtime.
 *
 *   node scripts/train-policy.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const GOAL = [0.16, -0.18, 0];

// --- forward kinematics, matching lib/kinematics.ts exactly ----------------
const BASE_Z = 0.07, SHOULDER_UP = 0.122, L1 = 0.21, L2 = 0.204, TOOL = 0.165;
const SHOULDER_HEIGHT = BASE_Z + SHOULDER_UP;
function toolPosition(q) {
  const [j1, j2, j3] = q;
  const wr = L1 * Math.sin(j2) + L2 * Math.sin(j2 + j3);
  const wz = SHOULDER_HEIGHT + L1 * Math.cos(j2) + L2 * Math.cos(j2 + j3);
  return [wr * Math.cos(j1), wr * Math.sin(j1), wz - TOOL];
}

/**
 * The state the policy sees, in relative coordinates.
 *
 * Relative on purpose: absolute positions would let it memorise the one datum
 * every recorded task shares, and it would then be a lookup table for this
 * bench rather than a policy. Told where the payload is *from the tool* and
 * where the goal is *from the payload*, it has to learn reaching and carrying.
 */
function features(tool, object, grip) {
  return [
    tool[0], tool[1], tool[2],
    object[0] - tool[0], object[1] - tool[1], object[2] - tool[2],
    GOAL[0] - object[0], GOAL[1] - object[1], GOAL[2] - object[2],
    grip > 14 ? 0 : 1,
  ];
}

// CORPUS=1 trains on what the ledger holds; the default trains on the scripted
// demonstrations, because the ledger's are not yet coherent enough to learn
// from and the two facts are worth keeping separate.
const SOURCE = process.env.CORPUS ? "/tmp/corpus.json" : "/tmp/demos.json";
const all = JSON.parse(readFileSync(SOURCE, "utf8"));
console.log(`source: ${SOURCE}`);

/**
 * Only episodes whose arm and payload agree.
 *
 * A recording where the jaws are closed and the tool is 200 mm from the object
 * is not a demonstration of anything — the two columns describe different
 * events. Twenty of the thirty-five on file are like that, and all twenty are
 * mine: test submissions whose joint angles were a linear ramp rather than the
 * pose that produced the payload's motion. Training on them teaches the
 * network that the tool's position is unrelated to the payload's, which is the
 * one thing it must not learn.
 *
 * The threshold is generous. A real grasp puts the tool within the capture
 * radius and half a payload height of the object, so anything under 60 mm is
 * consistent with holding it and anything near 200 mm cannot be.
 */
const COHERENT_MM = 60;
function coherent(ep) {
  const held = ep.samples.filter((s) => s.grip <= 14 && s.q);
  if (held.length < 20) return false;
  const d = held
    .map((s) => { const t = toolPosition(s.q); return Math.hypot(t[0] - s.object[0], t[1] - s.object[1]); })
    .sort((a, b) => a - b);
  return d[d.length >> 1] * 1000 < COHERENT_MM;
}
const corpus = all.filter(coherent);
console.log(`${all.length} episodes on file, ${corpus.length} coherent enough to learn from`);

// --- build (state, action) pairs -------------------------------------------
const episodes = [];
for (const ep of corpus) {
  const rows = [];
  for (let i = 0; i < ep.samples.length - 1; i += 1) {
    const a = ep.samples[i], b = ep.samples[i + 1];
    if (!a.q || !b.q) continue;
    const tool = toolPosition(a.q), next = toolPosition(b.q);
    // The action is what the operator did next: how the tool moved, and
    // whether the jaws were closed. Scaled up because a 20 Hz step is
    // millimetres and a network trained on millimetres learns to output zero.
    rows.push({
      x: features(tool, a.object, a.grip),
      y: [
        (next[0] - tool[0]) * 100,
        (next[1] - tool[1]) * 100,
        (next[2] - tool[2]) * 100,
        b.grip > 14 ? 0 : 1,
      ],
    });
  }
  if (rows.length > 20) episodes.push(rows);
}

// Held out by episode, never by frame: consecutive frames are near-identical,
// so a frame-wise split would put almost every test frame's neighbour in the
// training set and report a score that means nothing.
const shuffled = episodes.map((e, i) => ({ e, k: (i * 2654435761) % 1000 })).sort((a, b) => a.k - b.k).map((o) => o.e);
const cut = Math.max(1, Math.floor(shuffled.length * 0.2));
const test = shuffled.slice(0, cut).flat();
const train = shuffled.slice(cut).flat();
console.log(`${episodes.length} episodes → ${train.length} training frames, ${test.length} held out (${cut} episodes)`);

// --- normalisation ----------------------------------------------------------
const D = train[0].x.length, O = train[0].y.length;
const mean = Array(D).fill(0), std = Array(D).fill(0);
for (const r of train) for (let i = 0; i < D; i += 1) mean[i] += r.x[i] / train.length;
for (const r of train) for (let i = 0; i < D; i += 1) std[i] += (r.x[i] - mean[i]) ** 2 / train.length;
for (let i = 0; i < D; i += 1) std[i] = Math.sqrt(std[i]) || 1;
const norm = (x) => x.map((v, i) => (v - mean[i]) / std[i]);

// --- a two-hidden-layer MLP, by hand ---------------------------------------
const H = 48;
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
const mat = (r, c, s) => Array.from({ length: r }, () => Array.from({ length: c }, () => rand() * 2 * s));
const vec = (n) => Array(n).fill(0);

let W1 = mat(H, D, Math.sqrt(2 / D)), b1 = vec(H);
let W2 = mat(H, H, Math.sqrt(2 / H)), b2 = vec(H);
let W3 = mat(O, H, Math.sqrt(2 / H)), b3 = vec(O);

const relu = (v) => v.map((x) => (x > 0 ? x : 0));
function forward(x) {
  const z1 = W1.map((w, i) => w.reduce((s, wv, j) => s + wv * x[j], b1[i]));
  const a1 = relu(z1);
  const z2 = W2.map((w, i) => w.reduce((s, wv, j) => s + wv * a1[j], b2[i]));
  const a2 = relu(z2);
  const y = W3.map((w, i) => w.reduce((s, wv, j) => s + wv * a2[j], b3[i]));
  return { z1, a1, z2, a2, y };
}

// Adam, because plain SGD on this needs a learning rate schedule nobody wants
// to tune by hand.
const zerosLike = (m) => m.map((r) => (Array.isArray(r) ? r.map(() => 0) : 0));
let mW1 = zerosLike(W1), vW1 = zerosLike(W1), mb1 = vec(H), vb1 = vec(H);
let mW2 = zerosLike(W2), vW2 = zerosLike(W2), mb2 = vec(H), vb2 = vec(H);
let mW3 = zerosLike(W3), vW3 = zerosLike(W3), mb3 = vec(O), vb3 = vec(O);
const B1 = 0.9, B2 = 0.999, EPS = 1e-8;
let step = 0;

function loss(set) {
  let s = 0;
  for (const r of set) {
    const { y } = forward(norm(r.x));
    for (let i = 0; i < O; i += 1) s += OUT_WEIGHT[i] * (y[i] - r.y[i]) ** 2;
  }
  return s / (set.length * O);
}

/**
 * The jaws matter more than their share of the loss.
 *
 * Three of the four outputs are a tool delta and one is the grip. Under a plain
 * mean-squared error the grip is a quarter of the signal, and the moment that
 * actually decides the task — opening the jaws over the datum — is a handful of
 * frames out of two hundred and sixty. The first policy trained this way
 * reached the datum on every rollout and then held the payload two millimetres
 * above it for ever, because letting go was never worth much to it.
 */
const OUT_WEIGHT = [1, 1, 1, 6];

const LR = 0.002, BATCH = 64, EPOCHS = 60;
for (let epoch = 1; epoch <= EPOCHS; epoch += 1) {
  for (let start = 0; start < train.length; start += BATCH) {
    const batch = train.slice(start, start + BATCH);
    const gW1 = zerosLike(W1), gb1 = vec(H);
    const gW2 = zerosLike(W2), gb2 = vec(H);
    const gW3 = zerosLike(W3), gb3 = vec(O);

    for (const r of batch) {
      const x = norm(r.x);
      const { z1, a1, z2, a2, y } = forward(x);
      const dy = y.map((v, i) => (2 * OUT_WEIGHT[i] * (v - r.y[i])) / (batch.length * O));
      for (let i = 0; i < O; i += 1) {
        gb3[i] += dy[i];
        for (let j = 0; j < H; j += 1) gW3[i][j] += dy[i] * a2[j];
      }
      const da2 = vec(H);
      for (let j = 0; j < H; j += 1) for (let i = 0; i < O; i += 1) da2[j] += dy[i] * W3[i][j];
      const dz2 = da2.map((v, j) => (z2[j] > 0 ? v : 0));
      for (let i = 0; i < H; i += 1) {
        gb2[i] += dz2[i];
        for (let j = 0; j < H; j += 1) gW2[i][j] += dz2[i] * a1[j];
      }
      const da1 = vec(H);
      for (let j = 0; j < H; j += 1) for (let i = 0; i < H; i += 1) da1[j] += dz2[i] * W2[i][j];
      const dz1 = da1.map((v, j) => (z1[j] > 0 ? v : 0));
      for (let i = 0; i < H; i += 1) {
        gb1[i] += dz1[i];
        for (let j = 0; j < D; j += 1) gW1[i][j] += dz1[i] * x[j];
      }
    }

    step += 1;
    const c1 = 1 - Math.pow(B1, step), c2 = 1 - Math.pow(B2, step);
    const upd = (W, g, m, v) => {
      for (let i = 0; i < W.length; i += 1) {
        if (Array.isArray(W[i])) {
          for (let j = 0; j < W[i].length; j += 1) {
            m[i][j] = B1 * m[i][j] + (1 - B1) * g[i][j];
            v[i][j] = B2 * v[i][j] + (1 - B2) * g[i][j] ** 2;
            W[i][j] -= (LR * (m[i][j] / c1)) / (Math.sqrt(v[i][j] / c2) + EPS);
          }
        } else {
          m[i] = B1 * m[i] + (1 - B1) * g[i];
          v[i] = B2 * v[i] + (1 - B2) * g[i] ** 2;
          W[i] -= (LR * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + EPS);
        }
      }
    };
    upd(W1, gW1, mW1, vW1); upd(b1, gb1, mb1, vb1);
    upd(W2, gW2, mW2, vW2); upd(b2, gb2, mb2, vb2);
    upd(W3, gW3, mW3, vW3); upd(b3, gb3, mb3, vb3);
  }
  if (epoch % 10 === 0 || epoch === 1) {
    console.log(`epoch ${String(epoch).padStart(2)}  train ${loss(train).toFixed(5)}  held out ${loss(test).toFixed(5)}`);
  }
}

const params = W1.flat().length + W2.flat().length + W3.flat().length + H * 2 + O;
writeFileSync("public/policy.json", JSON.stringify({
  trainedOn: { episodes: episodes.length, frames: train.length, heldOutEpisodes: cut },
  arch: { in: D, hidden: H, out: O },
  params,
  loss: { train: loss(train), heldOut: loss(test) },
  mean, std, W1, b1, W2, b2, W3, b3,
}));
console.log(`\n${params} parameters → public/policy.json`);
