/**
 * Writes lib/changelog.json from `git log`, so /changelog is the history rather
 * than a copy of it that someone has to remember to refresh.
 *
 * Runs before `next dev` and `next build`. Where there is no usable history — a
 * build from a source archive with no .git, or a shallow clone that would
 * produce a truncated log — it keeps the committed file and says so, instead of
 * overwriting a real record with a partial one.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../lib/changelog.json", import.meta.url));
const LIMIT = 60;
const FIELD = "\x1f";
const RECORD = "\x1e";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function keep(reason) {
  if (!existsSync(OUT)) throw new Error(`changelog: ${reason}, and there is no committed lib/changelog.json to fall back on`);
  console.warn(`changelog: ${reason}; keeping the committed lib/changelog.json`);
  process.exit(0);
}

let raw;
try {
  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") keep("this is a shallow clone");
  raw = git(["log", `-n${LIMIT}`, "--no-merges", `--format=%h${FIELD}%aI${FIELD}%s${FIELD}%b${RECORD}`]);
} catch (e) {
  keep(`git log failed (${String(e.message).split("\n")[0]})`);
}

const entries = raw
  .split(RECORD)
  .map((r) => r.replace(/^\n+/, ""))
  .filter(Boolean)
  .map((r) => {
    const [hash, date, subject, body = ""] = r.split(FIELD);
    return { hash, date, subject, body: body.trim() };
  });

writeFileSync(OUT, JSON.stringify(entries, null, 2) + "\n");
console.log(`changelog: ${entries.length} entries, newest ${entries[0]?.hash ?? "none"}`);
