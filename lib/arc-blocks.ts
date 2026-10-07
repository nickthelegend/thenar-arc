import { useSyncExternalStore } from "react";
import { LOCALNET, RPC_ENDPOINTS, arcTestnet } from "./chain";

/**
 * Arc's heartbeat, read live: the head, the pace blocks are produced at, and
 * the finality the product's copy leans on, all measured in this page.
 *
 * Arc runs a BFT consensus with deterministic finality: a block is final when
 * it is produced, so the `finalized` tag *is* the head and there is nothing
 * between "included" and "final" to wait for. This store checks that claim on
 * every poll by reading both tags and reporting the gap (zero blocks on Arc),
 * and measures the block interval from the chain's own timestamps over a
 * window of recent blocks rather than quoting it.
 *
 * One poller per page, shared by every surface that shows it (the /thenar
 * landing panel, the station's heartbeat, /network). It runs only while a
 * surface is mounted and the tab is visible, over plain HTTPS JSON-RPC (Arc's
 * public endpoint answers CORS and batches).
 *
 * On a fork build the transactions are on the local fork, whose node mines on
 * demand and whose finalized tag trails by dozens of blocks; this strip reads
 * the real Arc testnet beside it, and says so.
 */

/** The network this strip reads: the app's own Arc, or Arc testnet beside a fork. */
export const HEARTBEAT_RPC = LOCALNET ? process.env.NEXT_PUBLIC_ARC_RPC || arcTestnet.rpcUrls.default.http[0] : RPC_ENDPOINTS[0];
export const HEARTBEAT_NAME = LOCALNET ? "Arc testnet" : undefined;

export type Head = { number: number; timestamp: number; hash: string; txs: number; gasUsed: number; seenAt: number };

export type Heartbeat = {
  connection: "idle" | "connecting" | "live" | "retrying";
  /** Newest first. */
  heads: Head[];
  /** Milliseconds per block from the chain's own timestamps over the window. */
  intervalMs: number | null;
  /** How many blocks that interval stands on. */
  window: number;
  /** Head minus the `finalized` tag at the last poll: 0 means final on inclusion. */
  finalizedLag: number | null;
  /** How many polls found the finalized tag at the head, out of how many. */
  finalAtHead: { yes: number; of: number };
  error: string | null;
};

const EMPTY: Heartbeat = { connection: "idle", heads: [], intervalMs: null, window: 0, finalizedLag: null, finalAtHead: { yes: 0, of: 0 }, error: null };

/** Blocks the interval is measured over. Timestamps are whole seconds, so the window is long enough to make that small. */
export const INTERVAL_WINDOW = 60;
const KEEP = 12;
const POLL_MS = 1_000;

/** Milliseconds per block from two (number, unix seconds) points. Null when they don't span a second. */
export function blockInterval(first: { number: number; timestamp: number }, last: { number: number; timestamp: number }): number | null {
  const blocks = last.number - first.number;
  const seconds = last.timestamp - first.timestamp;
  if (blocks <= 0 || seconds <= 0) return null;
  return (seconds * 1000) / blocks;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type RawBlock = { number: string; timestamp: string; hash: string; transactions: unknown[]; gasUsed: string } | null;

/** A JSON-RPC batch to `url`. Per-call errors come back as null; a 429 is said as such. */
export async function rpcBatch(url: string, calls: { method: string; params: unknown[] }[], signal?: AbortSignal): Promise<unknown[]> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }))),
    signal,
  });
  if (r.status === 429) throw new Error("Arc's public RPC is rate-limiting this page");
  if (!r.ok) throw new Error(`Arc's RPC answered ${r.status}`);
  const body = (await r.json()) as { id: number; result?: unknown; error?: { message: string } }[];
  const out: unknown[] = new Array(calls.length);
  for (const x of Array.isArray(body) ? body : []) out[x.id] = x.error ? null : x.result;
  return out;
}
const batch = (calls: { method: string; params: unknown[] }[], signal?: AbortSignal) => rpcBatch(HEARTBEAT_RPC, calls, signal);

const hex = (v: string) => Number.parseInt(v, 16);
const toHead = (b: NonNullable<RawBlock>, seenAt: number): Head => ({
  number: hex(b.number), timestamp: hex(b.timestamp), hash: b.hash, txs: b.transactions.length, gasUsed: hex(b.gasUsed), seenAt,
});

let state: Heartbeat = EMPTY;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let anchor: { number: number; timestamp: number } | null = null;

function publish(next: Heartbeat) {
  state = next;
  for (const l of listeners) l();
}

async function poll() {
  if (running) return;
  running = true;
  try {
    const [latest, finalized] = (await batch([
      { method: "eth_getBlockByNumber", params: ["latest", false] },
      { method: "eth_getBlockByNumber", params: ["finalized", false] },
    ])) as [RawBlock, RawBlock];
    if (!latest) throw new Error("no head");
    const now = performance.now();
    const head = toHead(latest, now);
    // The far end of the interval window, read once; the near end is every new head.
    if (!anchor || head.number - anchor.number > INTERVAL_WINDOW * 4) {
      const old = (await batch([{ method: "eth_getBlockByNumber", params: [`0x${Math.max(0, head.number - INTERVAL_WINDOW).toString(16)}`, false] }]))[0] as RawBlock;
      if (old) anchor = { number: hex(old.number), timestamp: hex(old.timestamp) };
    }
    const heads = state.heads[0]?.number === head.number ? state.heads : [head, ...state.heads.filter((h) => h.number < head.number)].slice(0, KEEP);
    const lag = finalized ? Math.max(0, head.number - hex(finalized.number)) : null;
    publish({
      connection: "live",
      heads,
      intervalMs: anchor ? blockInterval(anchor, head) : null,
      window: anchor ? head.number - anchor.number : 0,
      finalizedLag: lag,
      finalAtHead: lag === null ? state.finalAtHead : { yes: state.finalAtHead.yes + (lag === 0 ? 1 : 0), of: state.finalAtHead.of + 1 },
      error: null,
    });
  } catch (e) {
    publish({ ...state, connection: "retrying", error: e instanceof Error ? e.message : "unreachable" });
  } finally {
    running = false;
  }
  schedule(state.connection === "retrying" ? POLL_MS * 5 : POLL_MS);
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (users > 0 && document.visibilityState !== "hidden") timer = setTimeout(() => void poll(), ms);
}

function onVisibility() {
  if (document.visibilityState === "hidden") {
    if (timer) clearTimeout(timer);
    timer = null;
    publish({ ...state, connection: "idle" });
  } else if (users > 0) void poll();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  users += 1;
  if (users === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    if (state.connection === "idle") publish({ ...state, connection: "connecting" });
    void poll();
  }
  return () => {
    listeners.delete(listener);
    users -= 1;
    if (users === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

/** The live heartbeat; one shared poller however many surfaces read it. */
export function useArcHeartbeat(): Heartbeat {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
