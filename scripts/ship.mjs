/**
 * Deploy the whole product, both halves, in one command.
 *
 * This project is served by two hosts: Vercel renders the pages and every
 * /api/* is rewritten to the Railway `web` service. Deploying one is not
 * deploying the product, and both failure modes have already happened here — an
 * API fix that changed nothing because it only went to Vercel, and a new page
 * that 404'd for an hour because it only went to Railway.
 *
 * Vercel is forced. Its cache will otherwise reuse a build and report success:
 * a real build of this project compiles in 12-18s, and a log saying 2.3s means
 * nothing was rebuilt.
 *
 *   node scripts/ship.mjs            deploy both
 *   node scripts/ship.mjs --check    say what would happen, deploy nothing
 */
import { execSync } from "node:child_process";

const check = process.argv.includes("--check");
const RAILWAY_SERVICE = "54d62fa0-75b6-43dd-a102-7ca4523e148a";

const run = (cmd) => {
  if (check) { console.log(`  would run: ${cmd}`); return ""; }
  return execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
};

console.log("\n  shipping thenar — pages to Vercel, API to Railway\n");

console.log("  1/3  gate");
// Ship from a committed tree. In a git repository the Vercel CLI uploads what
// git knows about, so an untracked file is not in the build — which has already
// happened here: a new component deployed clean and its panel was missing.
const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty && !check) {
  console.error("       working tree is dirty — commit first, or Vercel ships without it:");
  console.error(dirty.split("\n").slice(0, 8).map((l) => "         " + l).join("\n"));
  process.exit(1);
}
run("npx tsc --noEmit -p tsconfig.json");
run("npm run build");
console.log("       typecheck and build clean");

console.log("  2/3  Vercel (forced, so the cache cannot serve a stale route)");
const v = run("npx vercel --prod --yes --force");
if (!check) {
  const ready = /"readyState":\s*"READY"/.test(v);
  const url = (v.match(/https:\/\/[a-z0-9-]+\.vercel\.app/) ?? [])[0] ?? "?";
  if (!ready) { console.error("       Vercel did not report READY — stopping"); process.exit(1); }
  console.log(`       READY  ${url}`);
}

console.log("  3/3  Railway");
run(`npx @railway/cli up --service ${RAILWAY_SERVICE} --detach`);
console.log("       uploaded\n");

console.log("  verify:  node scripts/qa-pages.mjs https://thenar.io");
console.log("           node scripts/qa-api.mjs   https://thenar.io\n");
