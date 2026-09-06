/** Final cut: app beats from the app take, explorer beats from the headed
 *  explorer take. Same transactions in both — the hashes come from one file. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
const OUT = "demo/out", WORK = `${OUT}/work2`;
rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true });
const durOf = (f) => Number(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","csv=p=0",f]).toString().trim());

const app = JSON.parse(readFileSync(`${OUT}/beats.json`, "utf8"));
const exp = JSON.parse(readFileSync(`${OUT}/beats-explorer.json`, "utf8"));
const appDur = durOf(`${OUT}/raw.mp4`), expDur = durOf(`${OUT}/explorer.mp4`);

const spansOf = (marks, total) => marks.map((m, i) => ({ id: m.id, start: m.atMs/1000,
  end: i + 1 < marks.length ? marks[i+1].atMs/1000 : total }));
const appSpans = spansOf(app.marks, appDur);
const expSpans = spansOf(exp.marks, expDur);
const EXPLORER = new Set(expSpans.map((s) => s.id));

// Running order: app beats in order, with the explorer block spliced where the
// app take had its (unusable) explorer beats.
const SPEED = {
  intro: 1.3, "landing-figures": 1.35, hub: 1.35, "station-open": 1.35,
  "station-begin": 1.45, "station-grasp": 2.5, "station-place": 3.4, "station-score": 1.15,
  sign: 1.3, confirmed: 1.1,
  "explorer-tx": 1.15, "explorer-transfer": 1.1, "explorer-address": 1.25, "explorer-contract": 1.3,
  leaderboard: 1.3, "task-page": 1.3, "run-verify": 1.3,
  foundry: 1.15, "licence-sign": 1.25, "licence-paid": 1.1, "licence-explorer": 1.1, outro: 1.35,
};

const order = [];
for (const sp of appSpans) {
  if (EXPLORER.has(sp.id)) {
    const e = expSpans.find((x) => x.id === sp.id);
    if (e) order.push({ ...e, src: `${OUT}/explorer.mp4` });
  } else order.push({ ...sp, src: `${OUT}/raw.mp4` });
}
// Any explorer beat the app take never had still belongs in the cut.
for (const e of expSpans) if (!order.some((o) => o.id === e.id)) order.push({ ...e, src: `${OUT}/explorer.mp4` });

const parts = []; let total = 0;
for (const sp of order) {
  const len = sp.end - sp.start;
  if (len <= 0.2) { console.log(`  skip ${sp.id}`); continue; }
  const sf = SPEED[sp.id] ?? 1.3;
  const out = `${WORK}/${String(parts.length).padStart(2,"0")}-${sp.id}.mp4`;
  execFileSync("ffmpeg", ["-y","-loglevel","error","-ss",sp.start.toFixed(3),"-t",len.toFixed(3),"-i",sp.src,
    "-vf",`setpts=PTS/${sf},fps=30,scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`,
    "-an","-c:v","libx264","-preset","veryfast","-crf","20", out]);
  const d = durOf(out); parts.push({ id: sp.id, file: out, out: d, speed: sf, src: sp.src }); total += d;
  console.log(`  ${sp.id.padEnd(18)} ${len.toFixed(1)}s -> ${d.toFixed(1)}s (${sf}x) ${sp.src.includes("explorer") ? "[explorer]" : ""}`);
}
console.log(`\nconcat total ${total.toFixed(1)}s`);
writeFileSync(`${WORK}/list.txt`, parts.map((p) => `file '${p.file.split("/").pop()}'`).join("\n"));
execFileSync("ffmpeg", ["-y","-loglevel","error","-f","concat","-safe","0","-i",`${WORK}/list.txt`,"-c","copy",`${OUT}/axon-demo.mp4`]);
let d = durOf(`${OUT}/axon-demo.mp4`);
if (d > 179) {
  const k = d / 174;
  console.log(`tightening ${k.toFixed(3)}x to fit 3:00`);
  execFileSync("ffmpeg", ["-y","-loglevel","error","-i",`${OUT}/axon-demo.mp4`,"-vf",`setpts=PTS/${k.toFixed(4)},fps=30`,
    "-an","-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",`${OUT}/tmp.mp4`]);
  execFileSync("sh", ["-c", `mv ${OUT}/tmp.mp4 ${OUT}/axon-demo.mp4`]);
  d = durOf(`${OUT}/axon-demo.mp4`);
}
console.log(`\nFINAL ${OUT}/axon-demo.mp4 — ${Math.floor(d/60)}:${String(Math.round(d%60)).padStart(2,"0")} (${d.toFixed(1)}s)`);
writeFileSync(`${OUT}/cut-manifest.json`, JSON.stringify({ parts, finalDur: d, txs: exp.txs }, null, 2));
