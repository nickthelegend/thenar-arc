/**
 * The app against the local Arc fork.
 *
 *   node scripts/fork-app.mjs [--serve] [--dev] [port]
 *
 * Reads .env.fork (written by scripts/arc-fork.mjs: the fork's RPC, the
 * deployment, throwaway role keys) into the app's environment, builds into
 * .next-fork so a fork build never overwrites the testnet one, and serves on
 * port 9010 unless told otherwise. `--serve` skips the build when .next-fork
 * exists; `--dev` runs `next dev` instead (no build).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readEnvFile } from "./arc.mjs";

if (!existsSync(".env.fork")) {
  console.error("  .env.fork is missing. Start the fork first: node scripts/arc-fork.mjs");
  process.exit(1);
}
const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a)) ?? "9010";
const fork = readEnvFile(".env.fork");
const env = {
  ...process.env,
  ...fork,
  NEXT_PUBLIC_ARC_NETWORK: "fork",
  NEXT_DIST_DIR: ".next-fork",
  LOCAL_APP_URL: `http://localhost:${port}`,
  PUBLIC_ORIGIN: `http://localhost:${port}`,
  NEXT_PUBLIC_SITE_ORIGIN: `http://localhost:${port}`,
};
const next = "node_modules/.bin/next";

if (args.includes("--dev")) {
  const child = spawn(next, ["dev", "-p", port], { env, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  if (!(args.includes("--serve") && existsSync(".next-fork/BUILD_ID"))) {
    const built = spawnSync(next, ["build"], { env, stdio: "inherit" });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
  const child = spawn(next, ["start", "-p", port], { env, stdio: "inherit" });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
}
