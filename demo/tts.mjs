/** One engine, one speed, measured durations. macOS `say` -> aiff -> wav. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const lines = JSON.parse(readFileSync("demo/script.json", "utf8"));
const VOICE = process.env.DEMO_VOICE ?? "Samantha";
const RATE = Number(process.env.DEMO_RATE ?? 178);
mkdirSync("demo/audio", { recursive: true });
const durations = {};
for (const { id, text } of lines) {
  const aiff = `demo/audio/${id}.aiff`, wav = `demo/audio/${id}.wav`;
  execFileSync("say", ["-v", VOICE, "-r", String(RATE), "-o", aiff, text]);
  // Level-match every line to one RMS so no line sits louder than another.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff,
    "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", wav]);
  const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries",
    "format=duration", "-of", "csv=p=0", wav]).toString().trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`NO_AUDIO for ${id}`);
  durations[id] = d;
  console.log(`${id.padEnd(16)} ${d.toFixed(2)}s`);
}
writeFileSync("demo/durations.json", JSON.stringify(durations, null, 2));
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`\nnarration total ${total.toFixed(1)}s (${(total/60).toFixed(2)} min)`);
