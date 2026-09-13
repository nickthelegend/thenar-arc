/**
 * Cut the take into the finished video — from the beat log, never by eye.
 *
 *   node demo/v2/cut.mjs scenes-static   # intro, e1-path, outro (no take data needed)
 *   node demo/v2/cut.mjs all             # approve the take, then everything
 *
 * Fails loudly (STALE_SOURCE, MISSING_MARK, NO_TAKE_TXS, NO_SLIDE_AUDIO, …)
 * rather than substituting anything.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, rmSync, readdirSync } from "node:fs";
import { chromium } from "playwright";

const MODE = process.argv[2] ?? "all";
const DIR = "demo/v2", TAKE = `${DIR}/take`, AUDIO = `${DIR}/audio`, OUT = `${DIR}/out`, SCENES = `${DIR}/scenes`, WORK = `${OUT}/work`;
mkdirSync(OUT, { recursive: true }); mkdirSync(SCENES, { recursive: true }); mkdirSync(WORK, { recursive: true });
const FW = 1920, FH = 1080, FPS = 30;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
const ff = (args) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const durOf = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const narration = JSON.parse(readFileSync("demo/narration.json", "utf8"));
const textOf = Object.fromEntries(narration.map((n) => [n.id, n.text]));
const durations = JSON.parse(readFileSync(`${AUDIO}/durations.json`, "utf8"));
for (const n of narration) if (!existsSync(`${AUDIO}/${n.id}.wav`)) throw new Error(`NO_SLIDE_AUDIO:${n.id}`);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const short = (h, a = 10, b = 6) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
const VENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS)];
const AENC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

// ---------------------------------------------------------------------------
// Scenes: HTML drawn frame by frame. Every animation is a CSS animation that
// is paused and seeked to each frame's time, so motion is exact, not captured.
// ---------------------------------------------------------------------------
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${FW}px;height:${FH}px;overflow:hidden;background:#EFEFEE;color:#0D0D0F;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
  .mono{font-family:Menlo,ui-monospace,monospace}
  .accent{color:#2B50E0}
  .rise{opacity:0;transform:translateY(40px);animation:rise .9s cubic-bezier(.16,1,.3,1) forwards}
  @keyframes rise{to{opacity:1;transform:none}}
  .pop{opacity:0;transform:scale(.86);animation:pop .7s cubic-bezier(.16,1,.3,1) forwards}
  @keyframes pop{to{opacity:1;transform:none}}
  .wipeout{animation:wipeout .8s cubic-bezier(.7,0,.84,0) forwards}
  @keyframes wipeout{to{opacity:0;transform:translateY(-60px)}}
  .label{font:600 22px/1 Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#6B6B70}
`;
async function renderScene(id, html, seconds) {
  const dir = `${WORK}/frames-${id}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: FW, height: FH }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><head><style>${BASE_CSS}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const frames = Math.ceil(seconds * FPS);
  for (let f = 0; f < frames; f++) {
    const ms = (f / FPS) * 1000;
    await p.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
    await p.screenshot({ path: `${dir}/f${String(f).padStart(5, "0")}.png`, type: "png" });
  }
  await b.close();
  const video = `${SCENES}/${id}.mp4`;
  const wav = `${AUDIO}/${id}.wav`;
  ff(["-framerate", String(FPS), "-i", `${dir}/f%05d.png`, "-i", wav, "-af", "apad", "-shortest", ...VENC, ...AENC, "-t", seconds.toFixed(3), video]);
  rmSync(dir, { recursive: true, force: true });
  if (durOf(video) < durations[id] - 0.05) throw new Error(`NO_SLIDE_AUDIO:${id} (scene shorter than its narration)`);
  return video;
}

// Time a scene's reveals across its own narration.
const at = (id, frac) => `${(durations[id] * frac).toFixed(2)}s`;

function introHtml() {
  const id = "intro", d = durations[id] + 1.0;
  const letters = "THENAR".split("").map((c, i) => `<span class="rise" style="display:inline-block;animation-delay:${0.08 * i + 0.1}s">${c}</span>`).join("");
  const chips = ["Arc Testnet", "Hedera", "World", "Privy"].map((c, i) => `<span class="pop" style="animation-delay:${1.4 + i * 0.18}s;display:inline-block;border:2px solid #0D0D0F;border-radius:999px;padding:14px 30px;margin:0 10px;font:600 30px/1 Menlo,monospace">${c}</span>`).join("");
  return [`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div class="label rise" style="animation-delay:.05s">ETHOnline 2026</div>
    <div style="font:800 260px/0.9 'Helvetica Neue',Arial,sans-serif;letter-spacing:-0.04em;margin-top:24px">${letters}</div>
    <div class="rise" style="animation-delay:.9s;font:500 52px/1.2 'Helvetica Neue',Arial;margin-top:28px">Robot training data, recorded by people, <span class="accent">paid per run</span></div>
    <div style="margin-top:56px">${chips}</div>
  </div>
  <div style="position:absolute;inset:0;background:#0D0D0F;transform:scaleY(0);transform-origin:top;animation:close .6s cubic-bezier(.7,0,.84,0) ${(d - 0.6).toFixed(2)}s forwards"></div>
  <style>@keyframes close{to{transform:scaleY(1)}}</style>`, d];
}

function pathHtml() {
  const id = "e1-path", d = durations[id] + 0.8;
  const stage = (x, y, title, sub, delay) => `<div class="pop" style="position:absolute;left:${x}px;top:${y}px;width:470px;height:170px;border:3px solid #0D0D0F;background:#fff;padding:26px 30px;animation-delay:${delay}">
      <div style="font:700 36px/1.15 'Helvetica Neue',Arial">${title}</div><div class="mono" style="font-size:24px;color:#4A4A50;margin-top:14px">${sub}</div></div>`;
  const conn = (x, y, w, delay) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:4px;background:#C9C9CC"></div>
      <div style="position:absolute;left:${x}px;top:${y - 8}px;width:20px;height:20px;border-radius:50%;background:#2B50E0;opacity:0;animation:travel 1.1s cubic-bezier(.45,0,.55,1) ${delay} forwards;--w:${w - 20}px"></div>`;
  return [`<div style="position:absolute;left:120px;top:90px" class="label rise">Follow the value</div>
    <div class="rise" style="position:absolute;left:120px;top:140px;font:800 76px/1 'Helvetica Neue',Arial;letter-spacing:-0.02em;animation-delay:.1s">Recorded, paid, sold, logged</div>
    ${stage(120, 330, "An operator's run", "scored by the verifier", at(id, 0.08))}
    ${conn(590, 415, 125, at(id, 0.16))}
    ${stage(715, 330, "Paid on Arc", "USDC · AxonProtocolV2", at(id, 0.22))}
    ${stage(120, 640, "An agent asks", "HTTP 402 · World AgentKit", at(id, 0.42))}
    ${conn(590, 725, 125, at(id, 0.5))}
    ${stage(715, 640, "Pays on Hedera", "0.5 HBAR → 0.0.10518776", at(id, 0.56))}
    ${conn(1185, 725, 125, at(id, 0.72))}
    ${stage(1310, 640, "Fingerprint logged", "HCS topic 0.0.10519262", at(id, 0.78))}
    <style>@keyframes travel{0%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(var(--w))}}</style>`, d];
}

function receiptsHtml(txs) {
  const id = "e2-receipts", d = durations[id] + 0.8;
  const card = (x, delay, chain, title, rows) => `<div class="pop" style="position:absolute;left:${x}px;top:300px;width:540px;border:3px solid #0D0D0F;background:#fff;animation-delay:${delay}">
      <div style="background:#0D0D0F;color:#fff;padding:18px 26px;font:600 24px/1 Menlo,monospace;letter-spacing:.12em;text-transform:uppercase">${chain}</div>
      <div style="padding:26px"><div style="font:700 38px/1.1 'Helvetica Neue',Arial;margin-bottom:22px">${title}</div>
      ${rows.map(([k, v], i) => `<div class="rise" style="animation-delay:calc(${delay} + ${0.25 + i * 0.12}s);margin-top:16px"><div class="label" style="font-size:18px">${esc(k)}</div><div class="mono" style="font-size:25px;margin-top:6px;word-break:${/^0x|@/.test(v) ? "break-all" : "normal"}">${esc(v)}</div></div>`).join("")}
      </div></div>`;
  return [`<div style="position:absolute;left:120px;top:90px" class="label rise">From this recording</div>
    <div class="rise" style="position:absolute;left:120px;top:140px;font:800 76px/1 'Helvetica Neue',Arial;letter-spacing:-0.02em;animation-delay:.1s">Three transactions</div>
    ${card(120, at(id, 0.12), "Arc Testnet", "Lab bounty", [["Transaction", short(txs.arcBounty.hash, 14, 8)], ["Task · block", `#${txs.arcBounty.task} · ${txs.arcBounty.block}`], ["Signed by", "Privy server wallet, under policy"]])}
    ${card(690, at(id, 0.38), "Hedera testnet", "Corpus sale (x402)", [["Transaction", txs.hederaX402.id], ["Payer → treasury", `${txs.hederaX402.payer} → 0.0.10518776`], ["Logged", `HCS ${txs.hederaX402.topic} #${txs.hederaX402.sequence}`]])}
    ${card(1260, at(id, 0.66), "Hedera · ATS", "Share issuance", [["Transaction", short(txs.hederaAts.hash, 14, 8)], ["Security", "THNRC · 0.0.10520394"], ["Supply", `${txs.hederaAts.supplyBefore} → ${txs.hederaAts.supplyAfter}`]])}`, d];
}

function worldHtml(gate) {
  const id = "e3-world", d = durations[id] + 0.8;
  const wallets = Array.from({ length: 40 }, (_, i) => `<div class="pop" style="width:52px;height:38px;border:2px solid #0D0D0F;border-radius:6px;background:#fff;animation-delay:${(0.02 * i + 0.3).toFixed(2)}s"></div>`).join("");
  return [`<div style="position:absolute;left:120px;top:90px" class="label rise">World ID Selfie Check</div>
    <div class="rise" style="position:absolute;left:120px;top:140px;font:800 76px/1 'Helvetica Neue',Arial;letter-spacing:-0.02em;animation-delay:.1s">One human, one set of runs</div>
    <div style="position:absolute;left:120px;top:320px;width:520px">
      <div style="font:700 36px/1.2 'Helvetica Neue',Arial">The attack</div>
      <div class="mono" style="font-size:24px;color:#4A4A50;margin:10px 0 22px">one person, many wallets</div>
      <div style="display:grid;grid-template-columns:repeat(8,52px);gap:10px">${wallets}</div>
    </div>
    <div class="pop" style="position:absolute;left:720px;top:320px;width:500px;border:3px solid #2B50E0;background:#fff;padding:28px;animation-delay:${at(id, 0.3)}">
      <div style="font:700 36px/1.2 'Helvetica Neue',Arial">The gate</div>
      <div style="font:500 30px/1.35 'Helvetica Neue',Arial;margin-top:16px">A run is signed only after a Selfie Check: one proof per human, bound to one wallet.</div>
    </div>
    <div class="pop" style="position:absolute;left:1300px;top:320px;width:500px;border:3px solid #0D0D0F;background:#fff;padding:28px;animation-delay:${at(id, 0.62)}">
      <div style="font:700 36px/1.2 'Helvetica Neue',Arial">In this recording</div>
      <div class="mono" style="font-size:22px;margin-top:16px;word-break:break-all">wallet ${esc(short(gate.operator ?? "", 8, 6))}</div>
      <div class="mono" style="font-size:22px;margin-top:10px">POST /api/verify</div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:18px"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#D33"></span><span class="mono" style="font:700 40px/1 Menlo,monospace">${esc(gate.status)}</span></div>
      <div style="font:500 26px/1.35 'Helvetica Neue',Arial;margin-top:14px">${esc(gate.message)}</div>
    </div>`, d];
}

function outroHtml() {
  const id = "outro", d = durations[id] + 1.4;
  const rows = [["People", "record the data"], ["Arc", "pays them in USDC"], ["Hedera", "sells and tokenizes it"], ["World", "keeps it one human per set of runs"]];
  return [`<div style="position:absolute;inset:0;background:#0D0D0F;color:#EFEFEE">
      <div style="position:absolute;left:160px;top:150px">
        ${rows.map(([a, b], i) => `<div class="rise" style="animation-delay:${at(id, 0.04 + i * 0.16)};font:700 74px/1.25 'Helvetica Neue',Arial"><span style="color:#7C97FF">${a}</span> ${b}</div>`).join("")}
      </div>
      <div class="pop" style="position:absolute;left:160px;top:720px;font:800 110px/1 'Helvetica Neue',Arial;letter-spacing:-0.03em;animation-delay:${at(id, 0.72)}">Thanks for watching.</div>
      <div class="rise mono" style="position:absolute;left:164px;top:880px;font-size:30px;color:#A8A8AE;animation-delay:${at(id, 0.8)}">github.com/nickthelegend/thenar-arc</div>
      <div style="position:absolute;inset:0;background:#0D0D0F;opacity:0;animation:fadeout .9s ease-in ${(d - 0.9).toFixed(2)}s forwards"></div>
      <style>@keyframes fadeout{to{opacity:1}}</style>
    </div>`, d];
}

async function scenesStatic() {
  for (const [id, fn] of [["intro", introHtml], ["e1-path", pathHtml], ["outro", outroHtml]]) {
    const [html, secs] = fn();
    await renderScene(id, html, secs);
    console.log(`scene ${id} ${durOf(`${SCENES}/${id}.mp4`).toFixed(2)}s`);
  }
}

if (MODE === "scenes-static") { await scenesStatic(); process.exit(0); }

// ---------------------------------------------------------------------------
// PHASE A — approve the take
// ---------------------------------------------------------------------------
const FRAMESF = `${TAKE}/frames.json`, LOG = `${TAKE}/beats.log`, TAKEF = `${TAKE}/take.json`;
for (const f of [FRAMESF, LOG, TAKEF]) if (!existsSync(f)) throw new Error(`MISSING_INPUT:${f}`);
if (statSync(FRAMESF).mtimeMs + 2000 < statSync(LOG).mtimeMs) throw new Error("STALE_SOURCE: frames.json is older than beats.log");
const take = JSON.parse(readFileSync(TAKEF, "utf8"));
if (take.failed) throw new Error(`TAKE_FAILED:${take.failed}`);
const marks = readFileSync(LOG, "utf8").trim().split("\n").map((l) => { const [, ms, ...rest] = l.split(" "); return { ms: Number(ms), id: rest.join(" ") }; });
const BEATS = narration.map((n) => n.id).filter((id) => /^b\d\d-/.test(id));
const markOf = (id) => { const m = marks.find((x) => x.id === id); if (!m) throw new Error(`MISSING_MARK:${id}`); return m.ms; };
const beatMs = BEATS.map(markOf);
for (let i = 1; i < beatMs.length; i++) if (!(beatMs[i] > beatMs[i - 1])) throw new Error(`MARK_ORDER:${BEATS[i]}`);
const endMs = markOf("END");
const SIGNING = ["b06-lab-sign", "b11-x402-sign", "b15-ats-sign"];
for (const s of SIGNING) { markOf(`${s}:signing`); markOf(`${s}:confirmed`); }
const txs = take.txs;
if (!/^0x[0-9a-f]{64}$/i.test(txs.arcBounty?.hash ?? "") || txs.arcBounty.status !== "0x1") throw new Error("NO_TAKE_TXS:arcBounty");
if (txs.hederaX402?.result !== "SUCCESS" || !txs.hederaX402.id) throw new Error("NO_TAKE_TXS:hederaX402");
if (txs.hederaAts?.result !== "SUCCESS" || txs.hederaAts.supplyAfter !== txs.hederaAts.supplyBefore + 10) throw new Error("NO_TAKE_TXS:hederaAts");
if (txs.worldGate?.status !== 403 || !txs.worldGate.message) throw new Error("NO_TAKE_WORLD_GATE");
if (take.appErrors?.length) console.log(`app console errors during take: ${take.appErrors.length}`, take.appErrors.slice(0, 5));

// Normalise the capture to constant 30 fps at 1920x1080 once.
const RAW30 = `${WORK}/raw30.mp4`;
{
  // Each screencast frame holds until the next one's own timestamp.
  const frames = JSON.parse(readFileSync(FRAMESF, "utf8")).sort((a, b) => a.ms - b.ms);
  if (frames.length < 100) throw new Error(`TOO_FEW_FRAMES:${frames.length}`);
  const rows = [];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].ms : endMs + 1500;
    rows.push(`file '${process.cwd()}/${TAKE}/frames/${frames[i].name}'`, `duration ${(Math.max(1, next - frames[i].ms) / 1000).toFixed(4)}`);
  }
  rows.push(`file '${process.cwd()}/${TAKE}/frames/${frames.at(-1).name}'`);
  writeFileSync(`${WORK}/frames.txt`, rows.join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", `${WORK}/frames.txt`, "-vf", `fps=${FPS},scale=${FW}:${FH}:flags=lanczos`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", RAW30]);
}

// Lock the log's clock to the video's: the first white frame is SYNC_FLASH_ON.
const gray = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-t", "8", "-i", RAW30, "-vf", "fps=60,scale=16:9,format=gray", "-f", "rawvideo", "-"]);
let flashFrame = -1;
for (let f = 0; f * 144 < gray.length; f++) {
  let sum = 0; for (let i = 0; i < 144; i++) sum += gray[f * 144 + i];
  if (sum / 144 > 200) { flashFrame = f; break; }
}
if (flashFrame < 0) throw new Error("NO_SYNC_FLASH");
const offset = flashFrame / 60 - markOf("SYNC_FLASH_ON") / 1000;
const vt = (ms) => ms / 1000 + offset;
console.log(`sync offset ${offset.toFixed(3)}s`);

// Frames to LOOK at, one per beat, pulled for review.
mkdirSync(`${OUT}/review`, { recursive: true });
BEATS.forEach((id, i) => {
  const t = vt(beatMs[i]) + Math.min(2.5, durations[id] * 0.6);
  ff(["-ss", t.toFixed(2), "-i", RAW30, "-frames:v", "1", "-vf", "scale=640:-1", `${OUT}/review/${id}.jpg`]);
});
if (MODE === "review") { console.log("review frames written"); process.exit(0); }

// ---------------------------------------------------------------------------
// PHASE D — clips from the log
// ---------------------------------------------------------------------------
const MAX_SPEED = 3.0, BREATH = 0.35, THINK_TO = 3.5;
function beatClip(id, i) {
  const start = vt(beatMs[i]);
  const end = vt(i + 1 < BEATS.length ? beatMs[i + 1] : endMs);
  const parts = [];
  if (SIGNING.includes(id)) {
    const s = vt(markOf(`${id}:signing`)), c = vt(markOf(`${id}:confirmed`));
    parts.push({ from: start, to: s, speed: null });
    parts.push({ from: s, to: c, speed: Math.max(1, (c - s) / THINK_TO) }); // thinking span: compressed, not narrated over a still
    parts.push({ from: c, to: end, speed: null });
  } else {
    parts.push({ from: start, to: end, speed: null });
  }
  const fixed = parts.filter((p) => p.speed !== null).reduce((a, p) => a + (p.to - p.from) / p.speed, 0);
  const free = parts.filter((p) => p.speed === null).reduce((a, p) => a + (p.to - p.from), 0);
  const target = durations[id] + BREATH;
  const freeSpeed = Math.min(MAX_SPEED, Math.max(1, free / Math.max(0.5, target - fixed)));
  const segFiles = parts.map((p, k) => {
    const sp = p.speed ?? freeSpeed;
    const f = `${WORK}/${id}-p${k}.mp4`;
    const len = p.to - p.from;
    if (len <= 0.04) return null;
    ff(["-ss", p.from.toFixed(3), "-t", len.toFixed(3), "-i", RAW30, "-vf", `setpts=(PTS-STARTPTS)/${sp.toFixed(4)},fps=${FPS}`, "-an", ...VENC, f]);
    return f;
  }).filter(Boolean);
  const joined = `${WORK}/${id}-v.mp4`;
  const list = `${WORK}/${id}-list.txt`;
  writeFileSync(list, segFiles.map((f) => `file '${f.split("/").pop()}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  const vd = durOf(joined);
  const pad = Math.max(0, target - vd); // clamped: never a negative pad
  const clip = `${WORK}/clip-${id}.mp4`;
  ff(["-i", joined, "-i", `${AUDIO}/${id}.wav`, "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}[v];[1:a]apad[a]`, "-map", "[v]", "-map", "[a]", "-shortest", ...VENC, ...AENC, clip]);
  return clip;
}

const [e2, e2s] = receiptsHtml(txs);
await renderScene("e2-receipts", e2, e2s);
const [e3, e3s] = worldHtml(txs.worldGate);
await renderScene("e3-world", e3, e3s);
if (!["intro", "e1-path", "outro"].every((id) => existsSync(`${SCENES}/${id}.mp4`))) await scenesStatic();

const ORDER = narration.map((n) => n.id);
const clips = [];
for (const id of ORDER) {
  if (/^b\d\d-/.test(id)) clips.push({ id, file: beatClip(id, BEATS.indexOf(id)) });
  else clips.push({ id, file: `${SCENES}/${id}.mp4` });
  console.log(`clip ${id} ${durOf(clips.at(-1).file).toFixed(2)}s`);
}
for (const c of clips) {
  const hasAudio = run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", c.file]).toString().trim();
  if (!hasAudio) throw new Error(`NO_SLIDE_AUDIO:${c.id}`);
}

// Clean master at 1.0x, timed from the normalised clips.
const MASTER = `${OUT}/thenar-demo-clean-1x.mp4`;
writeFileSync(`${WORK}/all.txt`, clips.map((c) => `file '${c.file.startsWith(WORK) ? c.file.split("/").pop() : "../../scenes/" + c.file.split("/").pop()}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", `${WORK}/all.txt`, ...VENC, ...AENC, MASTER]);
let t = 0;
const timeline = clips.map((c) => { const d = durOf(c.file); const r = { id: c.id, start: t, dur: d }; t += d; return r; });
const total1x = t;
const SPEED = total1x > 298 ? Math.min(1.2, total1x / 295) : 1.0;
let FINAL_CLEAN = MASTER;
if (SPEED > 1.0001) {
  FINAL_CLEAN = `${OUT}/thenar-demo-clean.mp4`;
  ff(["-i", MASTER, "-filter_complex", `[0:v]setpts=PTS/${SPEED.toFixed(4)},fps=${FPS}[v];[0:a]atempo=${SPEED.toFixed(4)}[a]`, "-map", "[v]", "-map", "[a]", ...VENC, ...AENC, FINAL_CLEAN]);
}
console.log(`1.0x ${total1x.toFixed(1)}s, speed ${SPEED.toFixed(3)} -> ${durOf(FINAL_CLEAN).toFixed(1)}s`);

// ---------------------------------------------------------------------------
// PHASE F — subtitles: phrase-level cues, one line each where possible
// ---------------------------------------------------------------------------
function phrases(text, max = 58) {
  const out = [];
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? [text]) {
    let rest = sentence.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(", ", max);
      if (cut < 18) cut = rest.lastIndexOf(" ", max);
      if (cut < 1) throw new Error(`UNSPLITTABLE_CUE:${rest}`);
      out.push(rest.slice(0, cut + (rest[cut] === "," ? 1 : 0)).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
const cues = [];
for (const row of timeline) {
  const chunks = phrases(textOf[row.id]);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let s = row.start;
  const speak = durations[row.id];
  for (const c of chunks) {
    const len = speak * (c.length / total);
    cues.push({ start: s / SPEED, end: (s + len) / SPEED, text: c });
    s += len;
  }
}
const srtTime = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
writeFileSync(`${OUT}/thenar-demo.srt`, cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"));
writeFileSync(`${WORK}/cues.json`, JSON.stringify(cues));
run("python3", [`${DIR}/subs.py`, `${WORK}/cues.json`, `${WORK}/subs`, String(FW), String(FH), String(durOf(FINAL_CLEAN))]);
const BURNED = `${OUT}/thenar-demo.mp4`;
ff(["-i", FINAL_CLEAN, "-f", "concat", "-safe", "0", "-i", `${WORK}/subs/list.txt`, "-filter_complex", "[1:v]format=rgba[s];[0:v][s]overlay=0:0:format=auto:eof_action=pass[v]", "-map", "[v]", "-map", "0:a", ...VENC, "-c:a", "copy", BURNED]);

// ---------------------------------------------------------------------------
// PHASE I/J — checks and publish kit
// ---------------------------------------------------------------------------
const silence = run("ffmpeg", ["-hide_banner", "-i", BURNED, "-af", "silencedetect=noise=-40dB:d=2.5", "-f", "null", "-"]).toString();
const kit = [];
const chapter = (id) => timeline.find((r) => r.id === id).start / SPEED;
const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
kit.push("# Thenar — ETHOnline 2026 demo", "");
kit.push(`Runtime: ${mmss(durOf(BURNED))}`, "");
kit.push("## Chapters", ...[["intro", "What Thenar is"], ["b03-station", "Driving the arm"], ["b05-lab", "Privy lab budget on Arc"], ["b09-agents", "Agents pay on Hedera (x402)"], ["b14-corpus-token", "The corpus as a security (ATS)"], ["e3-world", "World ID Selfie Check"], ["b18-contracts", "Contracts and status"]].map(([id, name]) => `${mmss(chapter(id))} ${name}`), "");
kit.push("## Transactions in this recording",
  `- Arc bounty (task #${txs.arcBounty.task}): ${txs.arcBounty.explorer}`,
  `- Hedera x402 sale: ${txs.hederaX402.explorer}`,
  `- Hedera sales log: HCS topic ${txs.hederaX402.topic} message #${txs.hederaX402.sequence} — https://hashscan.io/testnet/topic/${txs.hederaX402.topic}`,
  `- Hedera ATS issuance (supply ${txs.hederaAts.supplyBefore} → ${txs.hederaAts.supplyAfter}): ${txs.hederaAts.explorer}`,
  `- World ID gate: ${txs.worldGate.status} "${txs.worldGate.message}" for wallet ${txs.worldGate.operator}`, "");
kit.push("## Links", "- Repo: https://github.com/nickthelegend/thenar-arc", "- ATS security: https://hashscan.io/testnet/contract/0.0.10520394", "- AxonProtocolV2: https://testnet.arcscan.app/address/0x6D6D6D0ee86C654b69646223049D6812c0218B2f", "");
kit.push("## Silences over 2.5s", ...(silence.match(/silence_start: [\d.]+|silence_end: [\d.]+ \| silence_duration: [\d.]+/g) ?? ["none"]));
writeFileSync(`${OUT}/publish-kit.md`, kit.join("\n"));
writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ speed: SPEED, offset, timeline, cues: cues.length }, null, 2));
console.log(`DONE ${BURNED} ${mmss(durOf(BURNED))}`);
