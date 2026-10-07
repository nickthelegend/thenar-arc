/**
 * Thenar on this machine, in one command.
 *
 *   pnpm demo            build the app, then run everything
 *   pnpm demo --serve    reuse the last build
 *
 * Starts, in order:
 * - the local chain (anvil on :8645, with the contracts and .env.localnet);
 * - the x402 facilitator on :4021;
 * - the Envio indexer, when its database containers are up;
 * - the app on :3336.
 * Everything on chain is a real signed transaction on that local chain, not on
 * Monad. Ctrl-C stops exactly what this script started, by PID, and nothing
 * else on the machine.
 *
 * Open http://localhost:3336/localnet and press "Sign in with the local
 * wallet". Passkeys need a hostname, so use localhost, not 127.0.0.1.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createPublicClient, http } from "viem";

const serveOnly = process.argv.includes("--serve");
const RPC = "http://127.0.0.1:8645";
const APP = "http://localhost:3336";
const started = [];
const say = (k, v) => console.log(`${k.padEnd(10)}${v}`);

const listening = async (url) => fetch(url, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
const chainUp = () => createPublicClient({ transport: http(RPC) }).getChainId().then((id) => id === 31337, () => false);
async function until(test, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what} did not come up within ${ms / 1000} s`);
}
function start(name, cmd, args, env = {}) {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } });
  started.push({ name, p });
  p.on("exit", (code) => { if (!stopping) say(name, `exited (${code}); stopping the rest`); if (!stopping) stop(1); });
  return p;
}

/** A process and everything it started, children first, by PID: never by name, on a machine other projects share. */
function killTree(pid) {
  const kids = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  for (const k of kids) killTree(Number(k));
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { name, p } of [...started].reverse()) {
    // localnet-app.mjs builds with spawnSync, so its child would outlive a signal to it alone.
    if (p.exitCode === null) { killTree(p.pid); say(name, `stopped (pid ${p.pid} and its children)`); }
  }
  if (indexerStarted) spawnSync("sh", ["scripts/stop.sh"], { cwd: "indexer", stdio: "inherit" });
  setTimeout(() => process.exit(code), 500);
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0));

// A failure while starting stops what has started, rather than leaving it running.
process.on("unhandledRejection", (e) => { say("failed", e instanceof Error ? e.message : String(e)); stop(1); });

// 1. The chain. If one already answers on :8645, it is used as it is.
if (await chainUp()) {
  say("chain", `already answering at ${RPC}; using it`);
  spawnSync(process.execPath, ["scripts/localnet.mjs"], { stdio: "inherit" }); // writes .env.localnet, deploys anything missing
} else {
  start("chain", process.execPath, ["scripts/localnet.mjs"]);
  await until(async () => (await chainUp()) && existsSync(".env.localnet"), 180_000, "the local chain");
  await until(async () => existsSync(".env.localnet"), 60_000, ".env.localnet");
}

// 2. The x402 facilitator, unless one already answers.
if (await listening("http://127.0.0.1:4021/supported")) {
  say("x402", "a facilitator already answers on :4021; using it");
} else {
  start("x402", process.execPath, ["--import", "./test/register.mjs", "scripts/x402-facilitator.mjs"], { NEXT_PUBLIC_CHAIN: "local" });
}

// 3. The indexer, only on its own database containers (indexer/scripts/start.sh checks them).
let indexerStarted = false;
const healthy = (c) => spawnSync("docker", ["inspect", "-f", "{{.State.Health.Status}}", c], { encoding: "utf8" }).stdout?.trim() === "healthy";
if (healthy("thenar-envio-pg") && healthy("thenar-envio-hasura")) {
  const r = spawnSync("sh", ["scripts/start.sh", "--bg"], { cwd: "indexer", encoding: "utf8" });
  indexerStarted = r.status === 0;
  say("indexer", indexerStarted ? "started (history on /leaderboard)" : (r.stderr || r.stdout).trim().split("\n").pop());
} else {
  say("indexer", "its database is not up (cd indexer && pnpm db:up); /leaderboard will say the indexer is unavailable");
}

// 4. The app.
start("app", process.execPath, ["scripts/localnet-app.mjs", ...(serveOnly && existsSync(".next-local") ? ["--serve"] : [])]);
// A production build on a busy machine can take many minutes.
await until(() => listening(`${APP}/api/health`), 1_800_000, "the app");
say("ready", `${APP}/localnet  (Ctrl-C stops everything this started)`);
