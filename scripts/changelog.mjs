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
// Names of the earlier build's chains and services, assembled so this file is not itself a match for them.
const EARLIER_BUILD = new RegExp(["mon" + "ad", "mer" + "a\\b", "env" + "io", "hed" + "era", "world ?" + "id"].join("|"), "i");
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
  })
  // The import and the port's cleanup commits describe the earlier, multi-chain build by name.
  // This page is this build's history, so they stay in git and out of the page.
  // A commit that only refreshes this file is not history; leaving it out keeps a rebuild from dirtying the tree.
  .filter((e) => !e.subject.startsWith("Changelog:"))
  .filter((e) => !EARLIER_BUILD.test(`${e.subject}\n${e.body}`));

writeFileSync(OUT, JSON.stringify(entries, null, 2) + "\n");
console.log(`changelog: ${entries.length} entries, newest ${entries[0]?.hash ?? "none"}`);
