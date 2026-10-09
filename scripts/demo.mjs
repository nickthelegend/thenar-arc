/**
 * Thenar on a local Arc fork, in one command.
 *
 *   pnpm demo            build the app, then run everything
 *   pnpm demo --serve    reuse the last fork build (.next-fork)
 *   pnpm demo --dev      run the app with next dev instead of a build
 *
 * Starts, in order:
 * - the Arc fork (scripts/arc-fork.mjs: Arc Foundry's anvil on :9000 forking
 *   Arc testnet, Thenar deployed, .env.fork written), unless one is already
 *   answering there;
 * - the app on :9010 (scripts/fork-app.mjs), which settles x402 itself.
 * Everything on chain is a real signed transaction on the fork, in Circle's
 * real USDC. Ctrl-C stops exactly what this script started, by PID, and
 * nothing else on the machine.
 *
 * Open http://localhost:9010/localnet and press "Sign in with the local
 * wallet". Passkeys need a hostname, so use localhost, not 127.0.0.1.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createPublicClient, http } from "viem";

const args = process.argv.slice(2);
const RPC = process.env.NEXT_PUBLIC_FORK_RPC || "http://127.0.0.1:9000";
const APP = "http://localhost:9010";
const started = [];
const say = (k, v) => console.log(`${k.padEnd(10)}${v}`);

const listening = (url) => fetch(url, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false);
const chainUp = () => createPublicClient({ transport: http(RPC) }).getChainId().then((id) => id === 5042002, () => false);

async function until(check, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what} did not come up within ${ms / 1000} s`);
}

function start(name, cmd, argv) {
  // Its own process group, so stopping it stops what it spawned (anvil, next) too.
  const child = spawn(cmd, argv, { stdio: "inherit", detached: true });
  started.push({ name, child });
  child.on("exit", (code) => say(name, `exited ${code ?? ""}`));
  return child;
}

function stop() {
  for (const { name, child } of started.reverse()) {
    if (child.exitCode !== null) continue;
    try { process.kill(-child.pid, "SIGINT"); } catch { /* already gone */ }
    say(name, "stopped");
  }
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

if (await chainUp() && existsSync(".env.fork")) {
  say("fork", `already answering at ${RPC}; using it`);
} else {
  start("fork", process.execPath, ["scripts/arc-fork.mjs"]);
  await until(async () => (await chainUp()) && existsSync(".env.fork"), 600_000, "the Arc fork");
}

if (await listening(APP)) {
  say("app", `something is already serving ${APP}; not starting another`);
} else {
  const mode = args.includes("--dev") ? ["--dev"] : args.includes("--serve") ? ["--serve"] : [];
  start("app", process.execPath, ["scripts/fork-app.mjs", ...mode]);
  await until(() => listening(`${APP}/api/health`), 900_000, "the app");
}
say("ready", `${APP}/localnet  (Ctrl-C stops everything this started)`);
