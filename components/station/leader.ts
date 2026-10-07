"use client";

import { useSyncExternalStore } from "react";
import {
  LEADER_BAUD, LEADER_STALE_MS, leaderCommand, parseLeaderLine, type LeaderLine,
} from "@/lib/leader-protocol";

/**
 * A physical SO-101 leader driving the SO-101 on screen.
 *
 * The leader is an arm with no motors: six AS5600 encoders read where the
 * operator's hand has put each joint. Its pose reaches the page one of two
 * ways, and the station does not care which:
 *
 *  - straight over USB, through the browser's Web Serial (Chrome and Edge on a
 *    desktop): nothing to install;
 *  - through the arm relay (scripts/arm-relay.mjs --leader), which also drives
 *    a physical follower from the same pose and forwards it to the page.
 *
 * While a fresh pose is arriving, the drawn SO-101 takes it joint for joint
 * (components/station/so101-arm.tsx): no inverse kinematics, no smoothing.
 * The tool is wherever the chain's forward kinematics puts it, and the run
 * records what the operator's hand did.
 */
type Source = "serial" | "relay";
export type LeaderStatus = {
  source: Source | null;
  connecting: boolean;
  /** The last pose, degrees; null before the first calibrated line. */
  q: number[] | null;
  /** Encoder counts, when the leader has not been zeroed yet. */
  raw: number[] | null;
  calibrated: boolean | null;
  banner: string | null;
  fault: string | null;
  error: string | null;
  info: string | null;
  /** Whether the pose drives the arm on screen. Off leaves the keyboard in charge. */
  drive: boolean;
  /** Lines per second, for the panel. */
  hz: number;
};

type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

const state = {
  status: {
    source: null, connecting: false, q: null, raw: null, calibrated: null, banner: null,
    fault: null, error: null, info: null, drive: true, hz: 0,
  } as LeaderStatus,
  at: 0,
  port: null as SerialPortLike | null,
  reader: null as ReadableStreamDefaultReader<string> | null,
  count: 0,
  countFrom: 0,
  listeners: new Set<(s: LeaderStatus) => void>(),
  lastPublish: 0,
};

function publish(patch: Partial<LeaderStatus>, force = true) {
  state.status = { ...state.status, ...patch };
  // Poses arrive fifty times a second; the panel needs a tenth of that.
  const now = performance.now();
  if (!force && now - state.lastPublish < 100) return;
  state.lastPublish = now;
  for (const l of state.listeners) l(state.status);
}

function take(line: LeaderLine, source: Source) {
  const now = performance.now();
  if (line.kind === "joints") {
    state.at = now;
    state.count += 1;
    if (now - state.countFrom > 1000) {
      publish({ hz: Math.round((state.count * 1000) / (now - state.countFrom)) }, false);
      state.count = 0;
      state.countFrom = now;
    }
    const first = state.status.calibrated !== true;
    publish({ q: line.q, raw: null, calibrated: true, fault: null, source }, first);
  } else if (line.kind === "raw") {
    publish({ raw: line.raw, q: null, calibrated: false, source }, state.status.calibrated !== false);
  } else if (line.kind === "fault") {
    publish({ fault: line.text });
  } else if (line.kind === "banner") {
    publish({ banner: line.text });
  } else {
    publish({ info: line.text });
  }
}

/** Whether this browser can talk to a leader over USB. */
export const serialAvailable = () =>
  typeof navigator !== "undefined" && "serial" in navigator;

/** Ask for the leader's USB port and start reading it. */
export async function connectLeaderSerial(): Promise<void> {
  if (state.port) return;
  const serial = (navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
  publish({ connecting: true, error: null, fault: null });
  try {
    const port = await serial.requestPort();
    await port.open({ baudRate: LEADER_BAUD });
    state.port = port;
    publish({ connecting: false, source: "serial" });
    void readLoop(port);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    publish({
      connecting: false,
      error: /No port selected|NotFoundError/i.test(m) ? null : `The leader's port did not open: ${m}`,
    });
  }
}

async function readLoop(port: SerialPortLike) {
  if (!port.readable) return;
  const reader = port.readable.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
  state.reader = reader;
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = parseLeaderLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (line) take(line, "serial");
      }
      if (buffer.length > 512) buffer = "";
    }
  } catch (e) {
    publish({ error: `The leader stopped answering: ${e instanceof Error ? e.message : e}` });
  } finally {
    await disconnectLeaderSerial();
  }
}

export async function disconnectLeaderSerial(): Promise<void> {
  const { port, reader } = state;
  state.port = null;
  state.reader = null;
  try { await reader?.cancel(); } catch { /* already closed */ }
  try { reader?.releaseLock(); } catch { /* already released */ }
  try { await port?.close(); } catch { /* already closed */ }
  if (state.status.source === "serial") publish({ source: null, q: null, raw: null, calibrated: null, hz: 0 });
}

/** Send a calibration command to a leader on USB. */
export async function sendLeader(cmd: string): Promise<void> {
  const w = state.port?.writable?.getWriter();
  if (!w) throw new Error("No leader is connected over USB.");
  try {
    await w.write(new TextEncoder().encode(`${cmd}\n`));
  } finally {
    w.releaseLock();
  }
}

export const zeroLeader = () => sendLeader(leaderCommand.zero);
export const flipLeaderJoint = (joint: number, sign: 1 | -1) => sendLeader(leaderCommand.sign(joint, sign));
export const forgetLeader = () => sendLeader(leaderCommand.forget);

/** A pose the arm relay forwarded from a leader plugged into it. */
export function leaderFromRelay(q: unknown) {
  if (state.port) return; // a leader on USB here wins over one on the relay
  if (Array.isArray(q) && q.length === 6 && q.every((v) => typeof v === "number" && Number.isFinite(v))) {
    take({ kind: "joints", q: q as number[] }, "relay");
  }
}

export function relayLeaderGone() {
  if (state.status.source === "relay") publish({ source: null, q: null, calibrated: null, hz: 0 });
}

export function setLeaderDrive(on: boolean) {
  publish({ drive: on });
}

/** The pose that should drive the arm this frame, degrees, or null. */
export function leaderJoints(): number[] | null {
  const s = state.status;
  if (!s.drive || !s.q || !s.calibrated) return null;
  return performance.now() - state.at <= LEADER_STALE_MS ? s.q : null;
}

/** Whether a leader pose arrived recently enough to be driving. */
export const leaderLive = () => leaderJoints() !== null;

/** The leader's status, as React reads an outside store: `publish` replaces the object on every change. */
const subscribe = (onChange: () => void) => {
  const listener = () => onChange();
  state.listeners.add(listener);
  return () => void state.listeners.delete(listener);
};
const snapshot = () => state.status;

export function useLeader(): LeaderStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
