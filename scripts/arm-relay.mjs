#!/usr/bin/env node
/**
 * Put a run on a real SO-101.
 *
 *   node scripts/arm-relay.mjs                                  the station connects, nothing moves
 *   node scripts/arm-relay.mjs --follower /dev/cu.usbserial-B   stream targets to the MG996R follower (disarmed)
 *   node scripts/arm-relay.mjs --follower … --arm               allow it to arm once the pose is home
 *   node scripts/arm-relay.mjs --leader /dev/cu.usbserial-A     the AS5600 leader drives the follower directly
 *   node scripts/arm-relay.mjs … --owner <ed25519 public key>    only frames signed by the owner's passkey move the arm
 *
 * The station's "Mirror to my SO-101" connects here over a WebSocket on
 * loopback and streams the arm's joints in degrees, 30 times a second. This
 * speaks thenar-arms' firmware protocol unchanged (firmware/thenar): the
 * follower takes `Q q0 … q5`, `ARM` and `STOP`, and stops itself when a target
 * is more than 250 ms old; the leader prints `L q0 … q5`.
 *
 * Safety is the relay's job, not the page's:
 *   - it never arms without --arm, and then only from the home pose;
 *   - every target is checked against the joint limits and against the table
 *     (forward kinematics of the same CAD chain the station solves on);
 *   - a stale stream, a closed tab or a stopped relay sends STOP;
 *   - it listens on 127.0.0.1 and accepts pages only from loopback origins,
 *     Thenar's own (app.thenar.io, thenar.io), or ones named with --origin, so
 *     no other website can reach an arm on this desk;
 *   - with --owner, a frame moves the arm only if it is signed by that key:
 *     the Ed25519 key the owner's passkey derives (lib/robot-key.ts). A frame
 *     unsigned, signed by another key, older than two seconds or replayed
 *     stops the arm instead.
 */
import { createServer } from "node:http";
import { register } from "node:module";
import { parseArgs } from "node:util";

register("../test/resolve-ts.mjs", import.meta.url);
const { SO101, So101Chain } = await import("../lib/so101.ts");
const { commandMessage } = await import("../lib/robot-command.ts");
const { createPublicKey, verify: verifySig } = await import("node:crypto");
const { WebSocketServer } = await import("ws");

const { values: opt } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    host: { type: "string", default: "127.0.0.1" },
    leader: { type: "string" },
    follower: { type: "string" },
    arm: { type: "boolean", default: false },
    origin: { type: "string", multiple: true, default: [] },
    owner: { type: "string" },
  },
});
if (opt.arm && !opt.follower) {
  console.error("--arm needs --follower");
  process.exit(2);
}

if (opt.owner && !/^[0-9a-fA-F]{64}$/.test(opt.owner)) {
  console.error("--owner must be the 32-byte Ed25519 public key, as 64 hex characters");
  process.exit(2);
}
// An Ed25519 public key as Node takes it: the fixed SPKI prefix, then the 32 raw bytes.
const ownerKey = opt.owner
  ? createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(opt.owner, "hex")]), format: "der", type: "spki" })
  : null;
let lastSeq = -1;
/** Why a frame may not move the arm, or null. Only asked when --owner is set. */
function refusedFrame(msg) {
  if (!Number.isInteger(msg.seq) || !Number.isFinite(msg.ts) || typeof msg.sig !== "string") return "an unsigned command";
  if (Math.abs(Date.now() - msg.ts) > 2000) return "a stale command";
  if (msg.seq <= lastSeq) return "a replayed command";
  const ok = verifySig(null, commandMessage(msg.seq, msg.ts, msg.q), ownerKey, Buffer.from(msg.sig, "hex"));
  if (!ok) return "a command signed by someone other than the owner";
  lastSeq = msg.seq;
  return null;
}

const HOME = SO101.homeDeg;
const LIMITS = SO101.limitsDeg;

// ---- safety -------------------------------------------------------------------

const chain = new So101Chain();
const wrist = chain.nodes["follower_wrist_link"];
/** The gripping point and the wrist both stay above the table (mm, base frame). */
export function clearOfTable(q) {
  chain.set(q);
  chain.root.updateMatrixWorld(true);
  return chain.tcp.matrixWorld.elements[14] > 8 && wrist.matrixWorld.elements[14] > 20;
}
export function validTarget(q) {
  return Array.isArray(q) && q.length === 6 && q.every((v, i) => Number.isFinite(v) && v >= LIMITS[i][0] && v <= LIMITS[i][1]);
}
const nearHome = (q) => q.every((v, i) => Math.abs(v - HOME[i]) <= 3);

const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
/** Thenar's own sites, where the station runs. Nothing else is let in unless named. */
const THENAR = ["https://app.thenar.io", "https://thenar.io"];
const allowedOrigin = (o) => !o || loopback.test(o) || THENAR.includes(o) || opt.origin.includes(o);

// ---- serial -------------------------------------------------------------------

async function openSerial(path, onLine) {
  const { SerialPort, ReadlineParser } = await import("serialport");
  const port = new SerialPort({ path, baudRate: 115200 });
  port.pipe(new ReadlineParser({ delimiter: "\n" })).on("data", (l) => onLine(l.trim()));
  await new Promise((ok, fail) => {
    port.once("open", ok);
    port.once("error", fail);
  });
  return port;
}

const follower = { port: null, armed: false, requested: false, last: "", sentAt: 0, reason: "" };
const leader = { port: null, q: null, at: 0 };

function followerStop(why) {
  if (!follower.port) return;
  follower.port.write("STOP\n");
  if (follower.armed || follower.requested) console.log(`follower STOP (${why})`);
  follower.armed = false;
  follower.requested = false;
  follower.reason = why;
  broadcast(status());
}

function sendFollower(q, from) {
  if (!follower.port) return;
  if (!validTarget(q)) return followerStop(`invalid target from ${from}`);
  if (!clearOfTable(q)) return followerStop("the gripper would reach the table");
  const now = Date.now();
  if (now - follower.sentAt < 20) return; // 50 Hz is the firmware's own tick
  follower.sentAt = now;
  follower.port.write(`Q ${q.map((v) => v.toFixed(3)).join(" ")}\n`);
  if (opt.arm && !follower.armed && !follower.requested && nearHome(q)) {
    follower.port.write("ARM\n");
    follower.requested = true;
    console.log("follower: ARM requested at home");
  }
}

// ---- websocket ----------------------------------------------------------------

const server = createServer((req, res) => {
  res.writeHead(426, { "content-type": "text/plain" }).end("THENAR arm relay: WebSocket only\n");
});
const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024,
  verifyClient: ({ origin }) => {
    const ok = allowedOrigin(origin);
    if (!ok) console.log(`refused a page from ${origin}`);
    return ok;
  },
});
const clients = new Map();
let lastStation = 0;

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const [ws] of clients) if (ws.readyState === 1) ws.send(s);
}
function status() {
  return {
    type: "status",
    clients: clients.size,
    home: HOME,
    owner: opt.owner ? opt.owner.toLowerCase() : null,
    leader: leader.port ? { port: opt.leader, streaming: Date.now() - leader.at < 300 } : null,
    follower: follower.port
      ? { port: opt.follower, armed: follower.armed, canArm: opt.arm, last: follower.last, reason: follower.reason }
      : null,
  };
}

wss.on("connection", (ws, req) => {
  clients.set(ws, { role: "station", origin: req.headers.origin ?? "" });
  console.log(`station connected from ${req.headers.origin ?? "a local client"}`);
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === "state") {
      if (ownerKey && Array.isArray(msg.q)) {
        const why = refusedFrame(msg);
        if (why) return followerStop(`refused ${why}`);
      }
      lastStation = Date.now();
      // The physical leader, when it is streaming, is the only thing that drives hardware.
      if (!leader.port || Date.now() - leader.at > 300) sendFollower(msg.q, "station");
    } else if (msg.type === "stop") {
      followerStop("stopped from the station");
    }
  });
  ws.on("close", () => {
    clients.delete(ws);
    if (!clients.size && !leader.port) followerStop("the station disconnected");
    broadcast(status());
  });
  ws.send(JSON.stringify(status()));
  broadcast(status());
});

if (opt.follower) {
  follower.port = await openSerial(opt.follower, (line) => {
    follower.last = line;
    if (line === "ARMED") {
      follower.armed = true;
      console.log("follower ARMED");
    } else if (line.startsWith("STOP")) {
      follower.armed = false;
      follower.requested = false;
      follower.reason = line.slice(5);
    }
    broadcast(status());
  });
  setTimeout(() => follower.port.write("STOP\n"), 1500);
  console.log(`follower on ${opt.follower}${opt.arm ? " — may arm from home" : " — will not arm (no --arm)"}`);
}
if (opt.leader) {
  leader.port = await openSerial(opt.leader, (line) => {
    const p = line.split(/\s+/);
    if (p[0] !== "L" || p.length !== 7) return;
    const q = p.slice(1).map(Number);
    if (!validTarget(q)) return;
    leader.q = q;
    leader.at = Date.now();
    broadcast({ type: "leader", q, t: leader.at / 1000 });
    sendFollower(q, "leader");
  });
  console.log(`leader on ${opt.leader}`);
}

// The firmware stops itself on a stale target; say so here too, so the page knows.
setInterval(() => {
  if ((follower.armed || follower.requested) && !leader.port && Date.now() - lastStation > 250) followerStop("the station stream went quiet");
  broadcast(status());
}, 1000);

const shutdown = () => {
  followerStop("relay shutting down");
  setTimeout(() => process.exit(0), 100);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(+opt.port, opt.host, () => {
  console.log(`THENAR arm relay on ws://${opt.host}:${opt.port}`);
  // The page looks on 8787 unless told; tell it once and the browser remembers.
  if (opt.port !== "8787") console.log(`Open the station once with ?relay=ws://${opt.host}:${opt.port} so the page finds this relay.`);
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${opt.port} is taken: is another relay running? Start this one with --port 8788 and open the station with ?relay=ws://127.0.0.1:8788.` : e.message);
  followerStop("relay failed to start");
  process.exit(1);
});
