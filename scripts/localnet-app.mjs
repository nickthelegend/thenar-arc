/**
 * Build and serve Thenar against the local chain.
 *
 *   node scripts/localnet-app.mjs [port]        build, then serve (default 3336)
 *   node scripts/localnet-app.mjs --serve [port] serve the last build
 *
 * Reads .env.localnet (scripts/localnet.mjs writes it) into the environment,
 * which Next lets win over .env.local, and builds into .next-local so the
 * Monad build in .next is left alone.
 */
import { spawn, spawnSync } from "node:child_process";
import { readEnvFile } from "./monad.mjs";

const local = readEnvFile(".env.localnet");
if (local.NEXT_PUBLIC_CHAIN !== "local") {
  console.error("  .env.localnet is missing. Start the chain first: node scripts/localnet.mjs");
  process.exit(1);
}
const serveOnly = process.argv.includes("--serve");
const port = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? "3336";
const env = { ...process.env, ...local, NEXT_DIST_DIR: ".next-local", NEXT_TELEMETRY_DISABLED: "1" };

if (!serveOnly) {
  const b = spawnSync("npx", ["next", "build"], { env, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const s = spawn("npx", ["next", "start", "-p", port, "-H", "127.0.0.1"], { env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => s.kill(sig));
s.on("exit", (c) => process.exit(c ?? 0));
