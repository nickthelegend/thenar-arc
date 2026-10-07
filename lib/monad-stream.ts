"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_PIPELINE, applyHead, parseHead, isCommitState, type CommitState, type Pipeline } from "./monad-commit";
import { DEPLOYMENT } from "./deployment";

/**
 * One WebSocket to Monad testnet per page, shared by every surface that shows
 * the block pipeline.
 *
 * It subscribes to two Monad-only streams:
 * - `monadNewHeads`: every block, re-sent as it moves from Proposed through
 *   Voted and Finalized to Verified;
 * - `monadLogs`: events from Thenar's own contracts on Monad, with the commit
 *   state of the block that holds them.
 *
 * Read-only and public: the endpoint is Monad's own, it needs no key, and
 * nothing is sent but the two subscriptions. This is a live read of the real
 * network even on a local build, whose own transactions are on the local
 * chain; every surface that shows it says which is which.
 *
 * The socket opens when the first surface mounts and closes a moment after the
 * last one unmounts, or while the tab is hidden. A dropped socket retries with
 * a growing delay rather than hammering a rate-limited public endpoint.
 */

export const MONAD_WS = process.env.NEXT_PUBLIC_MONAD_WS || "wss://testnet-rpc.monad.xyz";

/** Thenar's contracts on Monad testnet, for the `monadLogs` filter. */
export const WATCHED = Object.values(DEPLOYMENT.contracts).filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a));

export type WatchedLog = {
  key: string;
  address: string;
  blockNumber: number;
  blockId: string;
  txHash: string;
  topic0: string;
  state: CommitState;
  seen: Partial<Record<CommitState, number>>;
};

export type Connection = "idle" | "connecting" | "live" | "retrying";

export type StreamState = {
  connection: Connection;
  /** When the current socket opened, on the page's clock. */
  since: number | null;
  /** Seconds until the next attempt, while retrying. */
  retryIn: number | null;
  pipeline: Pipeline;
  logs: WatchedLog[];
};

const INITIAL: StreamState = { connection: "idle", since: null, retryIn: null, pipeline: EMPTY_PIPELINE, logs: [] };

let state: StreamState = INITIAL;
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let users = 0;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let frame: number | null = null;
let subs: { heads?: string; logs?: string } = {};

/** Publish at most once a frame: four heads arrive each 300 ms slot. */
function publish(next: StreamState) {
  state = next;
  if (frame !== null) return;
  const flush = () => { frame = null; for (const l of listeners) l(); };
  frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
}

function onMessage(ev: MessageEvent) {
  let m: { id?: number; result?: unknown; params?: { subscription?: string; result?: unknown } };
  try { m = JSON.parse(String(ev.data)); } catch { return; }
  if (m.id === 1 && typeof m.result === "string") { subs.heads = m.result; return; }
  if (m.id === 2 && typeof m.result === "string") { subs.logs = m.result; return; }
  const p = m.params;
  if (!p?.subscription) return;
  const now = performance.now();
  if (p.subscription === subs.heads) {
    const h = parseHead(p.result);
    if (h) publish({ ...state, pipeline: applyHead(state.pipeline, h, now) });
  } else if (p.subscription === subs.logs) {
    const l = p.result as Record<string, unknown>;
    if (!l || !isCommitState(l.commitState) || typeof l.blockId !== "string") return;
    const key = `${l.transactionHash}:${l.logIndex}`;
    const blockNumber = Number.parseInt(String(l.blockNumber), 16);
    const known = state.logs.find((x) => x.key === key && x.blockId === l.blockId);
    let logs = known
      ? state.logs.map((x) => (x === known ? { ...x, state: l.commitState as CommitState, seen: { ...x.seen, [l.commitState as CommitState]: x.seen[l.commitState as CommitState] ?? now } } : x))
      : [{ key, address: String(l.address), blockNumber, blockId: l.blockId, txHash: String(l.transactionHash), topic0: String((l.topics as string[] | undefined)?.[0] ?? ""), state: l.commitState, seen: { [l.commitState]: now } }, ...state.logs];
    // The same rule as blocks: a finalized proposal kills its rivals at that height.
    if (l.commitState === "Finalized") logs = logs.filter((x) => x.blockNumber !== blockNumber || x.blockId === l.blockId);
    publish({ ...state, logs: logs.slice(0, 20) });
  }
}

function open() {
  if (ws || typeof WebSocket === "undefined") return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  publish({ ...state, connection: attempts ? "retrying" : "connecting", retryIn: null });
  const socket = new WebSocket(MONAD_WS);
  ws = socket;
  subs = {};
  socket.onopen = () => {
    attempts = 0;
    // A reconnect starts a fresh window: blocks left at Proposed across a gap would read as stuck.
    publish({ ...state, connection: "live", since: performance.now(), retryIn: null, pipeline: { ...EMPTY_PIPELINE, latencies: state.pipeline.latencies } });
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["monadNewHeads"] }));
    if (WATCHED.length) {
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_subscribe", params: ["monadLogs", { address: WATCHED }] }));
    }
  };
  socket.onmessage = onMessage;
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (users === 0 || document.visibilityState === "hidden") { publish({ ...state, connection: "idle", retryIn: null }); return; }
    attempts += 1;
    const delay = Math.min(30, 2 ** (attempts - 1));
    publish({ ...state, connection: "retrying", retryIn: delay });
    retryTimer = setTimeout(open, delay * 1000);
  };
  socket.onerror = () => socket.close();
}

function close() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const s = ws;
  ws = null;
  s?.close();
  publish({ ...state, connection: "idle", retryIn: null });
}

function onVisibility() {
  if (document.visibilityState === "hidden") close();
  else if (users > 0) open();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  users += 1;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (users === 1) document.addEventListener("visibilitychange", onVisibility);
  if (document.visibilityState !== "hidden") open();
  return () => {
    listeners.delete(listener);
    users -= 1;
    if (users === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      // A page change mounts the next surface straight away; keep the socket for it.
      closeTimer = setTimeout(close, 2000);
    }
  };
}

/** The live pipeline, re-rendered at most once a frame. */
export function useMonadStream(): StreamState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** The pipeline's current state, for code outside React (the two-timer receipt). */
export const monadStreamSnapshot = () => state;
