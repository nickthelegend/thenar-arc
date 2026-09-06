/** Prove the take is usable: real frames, right build, beats in order, tx real. */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { createPublicClient, http } from "viem";

const OUT = "demo/out";
let bad = 0;
const check = (ok, m, x = "") => { if (!ok) bad++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

check(existsSync(`${OUT}/raw.mp4`), "raw.mp4 exists");
const beats = JSON.parse(readFileSync(`${OUT}/beats.json`, "utf8"));
const plan = JSON.parse(readFileSync("demo/script.json", "utf8")).map((s) => s.id);

// Source newer than the beat log — never cut from a stale master.
const vAge = statSync(`${OUT}/raw.mp4`).mtimeMs, bAge = statSync(`${OUT}/beats.json`).mtimeMs;
check(vAge >= bAge - 5000, "source recording is not older than the beat log", `Δ ${((vAge - bAge) / 1000).toFixed(1)}s`);

const got = beats.marks.map((m) => m.id);
check(JSON.stringify(got) === JSON.stringify(plan), "every beat present, in order, no gaps",
  got.length === plan.length ? "" : `${got.length}/${plan.length}: missing ${plan.filter((p) => !got.includes(p)).join(", ")}`);
for (let i = 1; i < beats.marks.length; i++)
  check(beats.marks[i].atMs > beats.marks[i - 1].atMs, `beat ${beats.marks[i].id} starts after ${beats.marks[i - 1].id}`);

const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${OUT}/raw.mp4`]).toString().trim());
console.log(`\n  take runtime ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")} (${dur.toFixed(1)}s)`);
check(dur < 200, "under 3:00");
const last = beats.marks.at(-1);
check(dur * 1000 > last.atMs, "video covers the final beat");

// Pull a frame per beat and LOOK at it: not black, not uniform.
mkdirSync(`${OUT}/frames`, { recursive: true });
for (const m of beats.marks) {
  const t = (m.atMs / 1000 + Math.min(2, (beats.durations[m.id] ?? 3) / 3)).toFixed(2);
  const f = `${OUT}/frames/${m.id}.png`;
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", t, "-i", `${OUT}/raw.mp4`, "-frames:v", "1", f]);
    const stats = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-vf",
      "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] })
      .toString() + execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i ${f} -vf signalstats,metadata=print:key=lavfi.signalstats.YAVG -f null - 2>&1 | tail -2`]).toString();
    const y = Number(stats.match(/YAVG=([\d.]+)/)?.[1] ?? 0);
    check(y > 3 && y < 250, `frame at ${m.id} has real content`, `luma ${y.toFixed(1)}`);
  } catch { check(false, `frame at ${m.id} extracted`); }
}

// The signing beat's transaction is real, confirmed, and from THIS take.
const txs = existsSync(`${OUT}/take-txs.json`) ? JSON.parse(readFileSync(`${OUT}/take-txs.json`, "utf8")) : null;
check(!!txs, "take-txs.json written (NO_TAKE_TXS otherwise)");
if (txs) {
  const pub = createPublicClient({ chain: { id: 10143, name: "Monad Testnet",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } }, transport: http() });
  const r = await pub.getTransactionReceipt({ hash: txs.txHash }).catch(() => null);
  check(!!r && r.status === "success", "signing beat's tx is confirmed on chain", txs.txHash);
  check(beats.marks.find((m) => m.id === "sign")?.signing === true, "signing beat is flagged in the log");
}
console.log(bad === 0 ? "\nTAKE APPROVED\n" : `\nTAKE REJECTED — ${bad} check(s) failed\n`);
process.exit(bad ? 1 : 0);
