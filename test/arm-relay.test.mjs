/**
 * The arm relay (scripts/arm-relay.mjs) against a pseudo-terminal that answers
 * the way thenar-arms' follower firmware does (test/fake-follower.py). No
 * ESP32 and no servo: the serial protocol and the safety rules are what is
 * under test, and those are the relay's, not the hardware's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

let PORT = 18900 + Math.floor(Math.random() * 500);
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function relay(args = []) {
  PORT += 1;
  const p = spawn(process.execPath, ["scripts/arm-relay.mjs", "--port", String(PORT), ...args], { cwd: ROOT });
  let out = "";
  return new Promise((ok, fail) => {
    p.stdout.on("data", (d) => (out += d, out.includes("THENAR arm relay on") && ok(p)));
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (c) => fail(new Error(`relay exited ${c}: ${out}`)));
  });
}
function station(origin = "http://localhost:3334") {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin });
  const inbox = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d)));
  return new Promise((ok, fail) => {
    ws.on("open", () => ok({ ws, inbox, send: (q) => ws.send(JSON.stringify({ type: "state", q })) }));
    ws.on("error", fail);
  });
}
function fakeFollower() {
  const p = spawn("python3", [fileURLToPath(new URL("./fake-follower.py", import.meta.url))]);
  const lines = [];
  let path;
  p.stdout.on("data", (d) => {
    for (const l of String(d).split("\n").filter(Boolean)) path ? lines.push(l) : (path = l);
  });
  return until(() => path).then(() => ({ p, path, lines }));
}

test("a page from another website cannot reach the relay", async () => {
  const r = await relay();
  try {
    await assert.rejects(station("https://evil.example"), /403|Unexpected server response/);
    const ok = await station("http://localhost:3334");
    const s = await until(() => ok.inbox.find((m) => m.type === "status"));
    assert.equal(s.follower, null, "no hardware without --follower");
    ok.ws.close();
  } finally {
    r.kill();
  }
});

test("without --arm the follower gets targets but is never armed", async () => {
  const fw = await fakeFollower();
  const r = await relay(["--follower", fw.path]);
  try {
    const st = await station();
    for (let i = 0; i < 5; i++) (st.send([0, -25, 35, 0, 0, 20]), await pause(40));
    await until(() => fw.lines.some((l) => l.startsWith("Q ")));
    assert.ok(!fw.lines.includes("ARM"), fw.lines.join("\n"));
    st.ws.close();
  } finally {
    r.kill();
    fw.p.kill();
  }
});

test("with --arm it arms only from home, refuses a pose into the table, and stops when the station leaves", async () => {
  const fw = await fakeFollower();
  const r = await relay(["--follower", fw.path, "--arm"]);
  try {
    const st = await station();
    st.send([40, 30, -20, 0, 0, 20]); // away from home: a target, but no ARM
    await until(() => fw.lines.some((l) => l.startsWith("Q 40.000")));
    assert.ok(!fw.lines.includes("ARM"));
    await pause(40);
    st.send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    const armed = await until(() => st.inbox.findLast((m) => m.type === "status" && m.follower?.armed));
    assert.equal(armed.follower.armed, true);

    // Shoulder swung fully forward, arm straight: the gripper would end up under the table.
    await pause(40);
    st.send([0, 80, 0, 0, 0, 20]);
    await until(() => fw.lines.at(-1) === "STOP");
    assert.ok(!fw.lines.some((l) => l.startsWith("Q 0.000 80.000 0.000")), "the table pose was never sent");

    // Out of the joint limits is refused the same way.
    fw.lines.length = 0;
    await pause(40);
    st.send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    await pause(40);
    st.send([120, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.at(-1) === "STOP");
    assert.ok(!fw.lines.some((l) => l.startsWith("Q 120")));

    fw.lines.length = 0;
    await pause(40);
    st.send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    st.ws.close();
    await until(() => fw.lines.at(-1) === "STOP");
  } finally {
    r.kill();
    fw.p.kill();
  }
});

test("an armed follower is stopped when the station's stream goes quiet", async () => {
  const fw = await fakeFollower();
  const r = await relay(["--follower", fw.path, "--arm"]);
  try {
    const st = await station();
    st.send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    fw.lines.length = 0;
    // Connected, but sending nothing: a tab the browser stopped painting.
    await until(() => fw.lines.at(-1) === "STOP", 3000);
    st.ws.close();
  } finally {
    r.kill();
    fw.p.kill();
  }
});

test("with --owner, only frames signed by the owner's key move the arm", async () => {
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { commandMessage } = await import("../lib/robot-command.ts");
  const owner = generateKeyPairSync("ed25519"), stranger = generateKeyPairSync("ed25519");
  const raw = (k) => k.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const fw = await fakeFollower();
  const r = await relay(["--follower", fw.path, "--arm", "--owner", raw(owner)]);
  try {
    const st = await station();
    const s0 = await until(() => st.inbox.find((m) => m.type === "status"));
    assert.equal(s0.owner, raw(owner), "the relay says whose arm it is");
    let seq = 0;
    const signed = (q, key = owner.privateKey, at = Date.now(), n = ++seq) =>
      st.ws.send(JSON.stringify({ type: "state", q, seq: n, ts: at, sig: sign(null, commandMessage(n, at, q), key).toString("hex") }));

    for (let i = 0; i < 4; i++) (signed([0, -25, 35, 0, 0, 20]), await pause(40));
    await until(() => fw.lines.includes("ARM"));
    assert.ok(fw.lines.some((l) => l.startsWith("Q ")), "the owner's frames reach the arm");

    fw.lines.length = 0;
    st.send([0, -25, 35, 0, 0, 20]); // unsigned
    await until(() => fw.lines.at(-1) === "STOP");

    for (const bad of [
      () => signed([0, -25, 35, 0, 0, 20], stranger.privateKey),          // another key
      () => signed([0, -25, 35, 0, 0, 20], owner.privateKey, Date.now() - 10_000), // stale
      () => signed([0, -25, 35, 0, 0, 20], owner.privateKey, Date.now(), 1),       // replayed sequence
    ]) {
      fw.lines.length = 0;
      await pause(40);
      bad();
      await until(() => fw.lines.at(-1) === "STOP");
      assert.ok(!fw.lines.some((l) => l.startsWith("Q ")), "a refused frame never reaches the arm");
    }
    st.ws.close();
  } finally {
    r.kill();
    fw.p.kill();
  }
});
