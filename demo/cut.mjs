/**
 * Cut the raw take into a silent product demo. No narration: each beat's span
 * is speed-ramped so the slow stretches (driving the arm, waiting on a block)
 * move, and the moments that carry the proof play close to real time.
 *
 *   node demo/cut.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";

const OUT = "demo/out", WORK = "demo/out/work";
if (!existsSync(`${OUT}/raw.mp4`)) throw new Error("NO_RAW — run demo/record.mjs first");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const beats = JSON.parse(readFileSync(`${OUT}/beats.json`, "utf8"));
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
  "-of", "csv=p=0", `${OUT}/raw.mp4`]).toString().trim());

// How fast each beat should run. 1 = real time. The arm work and the explorer
// load are the slow stretches; the verdict and the transaction are the payoff.
const SPEED = {
  intro: 1.25,
  "landing-figures": 1.3,
  hub: 1.3,
  "station-open": 1.3,
  "station-begin": 1.4,
  // The arm work is the slow part: the driver hunts, and nobody needs to watch
  // it hunt. The grasp and the release still read at this rate.
  "station-grasp": 2.6,
  "station-place": 3.2,
  "station-score": 1.15,
  connect: 1.6,
  sign: 1.35,
  confirmed: 1.1,
  "explorer-tx": 1.15,
  "explorer-transfer": 1.15,
  "explorer-address": 1.2,
  "explorer-contract": 1.25,
  leaderboard: 1.25,
  "task-page": 1.25,
  "run-verify": 1.25,
  foundry: 1.15,
  "licence-sign": 1.3,
  "licence-paid": 1.1,
  "licence-explorer": 1.15,
  outro: 1.3,
};

const marks = beats.marks;
const spans = marks.map((m, i) => ({
  id: m.id,
  start: m.atMs / 1000,
  end: (i + 1 < marks.length ? marks[i + 1].atMs / 1000 : dur),
}));

const parts = [];
let total = 0;
for (const sp of spans) {
  const len = sp.end - sp.start;
  if (len <= 0.15) { console.log(`  skip ${sp.id} (${len.toFixed(2)}s)`); continue; }
  const sf = SPEED[sp.id] ?? 2.0;
  const out = `${WORK}/${sp.id}.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-ss", sp.start.toFixed(3), "-t", len.toFixed(3), "-i", `${OUT}/raw.mp4`,
    "-vf", `setpts=PTS/${sf},fps=30,scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2:black`,
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out]);
  const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", out]).toString().trim());
  parts.push({ id: sp.id, file: out, raw: len, out: d, speed: sf });
  total += d;
  console.log(`  ${sp.id.padEnd(16)} ${len.toFixed(1)}s -> ${d.toFixed(1)}s  (${sf}x)`);
}
if (!parts.length) throw new Error("NO_PARTS");

console.log(`\ncut total ${total.toFixed(1)}s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})`);

writeFileSync(`${WORK}/list.txt`, parts.map((p) => `file '${p.id}.mp4'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
  "-i", `${WORK}/list.txt`, "-c", "copy", `${OUT}/axon-demo.mp4`]);

let finalDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
  "-of", "csv=p=0", `${OUT}/axon-demo.mp4`]).toString().trim());

// Hard ceiling of 3:00 — if the cut runs long, re-encode the whole thing from
// the 1.0x concat rather than stacking a second ramp on an already-sped file.
if (finalDur > 179) {
  const extra = finalDur / 174;
  console.log(`over 3:00 — tightening by ${extra.toFixed(2)}x`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${OUT}/axon-demo.mp4`,
    "-vf", `setpts=PTS/${extra.toFixed(4)},fps=30`, "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", `${OUT}/axon-demo-tight.mp4`]);
  execFileSync("sh", ["-c", `mv ${OUT}/axon-demo-tight.mp4 ${OUT}/axon-demo.mp4`]);
  finalDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", `${OUT}/axon-demo.mp4`]).toString().trim());
}

const mm = Math.floor(finalDur / 60), ss = Math.round(finalDur % 60);
console.log(`\nFINAL ${OUT}/axon-demo.mp4 — ${mm}:${String(ss).padStart(2, "0")} (${finalDur.toFixed(1)}s)`);
writeFileSync(`${OUT}/cut-manifest.json`, JSON.stringify({ parts, finalDur, source: `${OUT}/raw.mp4` }, null, 2));
