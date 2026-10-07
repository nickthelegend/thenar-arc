/**
 * Monad's block pipeline, as `monadNewHeads` reports it.
 *
 * A standard `newHeads` subscription fires once per block. Monad's variant
 * fires again each time a block proposal moves through consensus:
 * Proposed (executed speculatively), Voted (one slot later), Finalized (two
 * slots later, irreversible) and Verified (state root agreed, three blocks of
 * execution delay after that). Each message names the proposal by `blockId`,
 * because two competing proposals can share a height.
 *
 * This is the pure half: what the page knows after each message. Times are
 * when this browser received each state, so every millisecond shown is
 * measured here, not quoted from the docs. A block first seen part-way through
 * (the page opened after it was proposed) is drawn but kept out of the
 * latency figures, since its clock did not start at Proposed.
 *
 * Two rules from Monad's docs shape it:
 * - a block can skip Voted and go straight from Proposed to Finalized;
 * - no message says a proposal was abandoned. When height N finalizes, every
 *   other proposal seen at N is dead, and it is dropped here.
 */

export const COMMIT_STATES = ["Proposed", "Voted", "Finalized", "Verified"] as const;
export type CommitState = (typeof COMMIT_STATES)[number];

const RANK: Record<CommitState, number> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 };

export const isCommitState = (s: unknown): s is CommitState =>
  typeof s === "string" && (COMMIT_STATES as readonly string[]).includes(s);

/** The fields of a `monadNewHeads` message this page uses. Numbers already decoded from hex. */
export type Head = {
  blockId: string;
  number: number;
  commitState: CommitState;
  hash?: string;
  gasUsed?: number;
  gasLimit?: number;
};

export type Block = {
  blockId: string;
  number: number;
  hash?: string;
  gasUsed?: number;
  gasLimit?: number;
  /** The furthest state reached. */
  state: CommitState;
  /** When this browser received each state, in ms on the page's clock. */
  seen: Partial<Record<CommitState, number>>;
  /** Whether its clock started at Proposed, so its latencies count. */
  fromProposed: boolean;
};

/** Rolling samples of measured latency from Proposed, in ms. */
export type Latencies = { Voted: number[]; Finalized: number[]; Verified: number[] };

export type Pipeline = {
  /** Newest height first; at one height, the surviving proposal. */
  blocks: Block[];
  latencies: Latencies;
  /** Arrival times of Proposed messages at new heights: [height, ms]. */
  arrivals: [number, number][];
  /** Proposals dropped because another one finalized at their height. */
  abandoned: number;
  messages: number;
};

export const EMPTY_PIPELINE: Pipeline = {
  blocks: [],
  latencies: { Voted: [], Finalized: [], Verified: [] },
  arrivals: [],
  abandoned: 0,
  messages: 0,
};

/** How many heights the strip keeps. Verified lands about five blocks after Proposed, so a dozen holds the whole pipeline. */
export const KEEP_HEIGHTS = 12;
/** How many latency samples, and Proposed arrivals, feed the medians and the cadence. */
export const KEEP_SAMPLES = 40;

const capped = <T,>(xs: T[], n: number) => (xs.length > n ? xs.slice(xs.length - n) : xs);

export function applyHead(p: Pipeline, h: Head, now: number): Pipeline {
  let abandoned = p.abandoned;
  let latencies = p.latencies;
  let arrivals = p.arrivals;
  const known = p.blocks.find((b) => b.blockId === h.blockId);
  let blocks: Block[];

  if (!known) {
    const block: Block = {
      blockId: h.blockId,
      number: h.number,
      hash: h.hash,
      gasUsed: h.gasUsed,
      gasLimit: h.gasLimit,
      state: h.commitState,
      seen: { [h.commitState]: now },
      fromProposed: h.commitState === "Proposed",
    };
    blocks = [...p.blocks, block];
    if (h.commitState === "Proposed" && !p.blocks.some((b) => b.number === h.number)) {
      arrivals = capped([...arrivals, [h.number, now]], KEEP_SAMPLES);
    }
  } else {
    blocks = p.blocks.map((b) => {
      if (b !== known) return b;
      const seen = b.seen[h.commitState] === undefined ? { ...b.seen, [h.commitState]: now } : b.seen;
      const state = RANK[h.commitState] > RANK[b.state] ? h.commitState : b.state;
      return { ...b, seen, state, hash: h.hash ?? b.hash, gasUsed: h.gasUsed ?? b.gasUsed, gasLimit: h.gasLimit ?? b.gasLimit };
    });
    // A latency is recorded once, the first time a block measured from Proposed reaches a state.
    if (known.fromProposed && h.commitState !== "Proposed" && known.seen[h.commitState] === undefined) {
      const ms = now - (known.seen.Proposed as number);
      latencies = { ...latencies, [h.commitState]: capped([...latencies[h.commitState], ms], KEEP_SAMPLES) };
    }
  }

  if (h.commitState === "Finalized") {
    const before = blocks.length;
    blocks = blocks.filter((b) => b.number !== h.number || b.blockId === h.blockId);
    abandoned += before - blocks.length;
  }

  blocks.sort((a, b) => b.number - a.number);
  const heights = [...new Set(blocks.map((b) => b.number))];
  if (heights.length > KEEP_HEIGHTS) {
    const floor = heights[KEEP_HEIGHTS - 1];
    blocks = blocks.filter((b) => b.number >= floor);
  }

  return { blocks, latencies, arrivals, abandoned, messages: p.messages + 1 };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Milliseconds per block, from when this browser saw each new height
 * proposed. Network jitter moves single gaps, so it is the span over the
 * window divided by the heights it covers. Null until there are enough.
 */
export function cadence(p: Pipeline, min = 5): number | null {
  const a = p.arrivals;
  if (a.length < min) return null;
  const [n0, t0] = a[0];
  const [n1, t1] = a[a.length - 1];
  return n1 > n0 ? (t1 - t0) / (n1 - n0) : null;
}

/** Decode one `eth_subscription` payload into a Head, or null when it is not one. */
export function parseHead(raw: unknown): Head | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.blockId !== "string" || typeof r.number !== "string" || !isCommitState(r.commitState)) return null;
  const hex = (v: unknown) => (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? Number.parseInt(v, 16) : undefined);
  const number = hex(r.number);
  if (number === undefined) return null;
  return {
    blockId: r.blockId,
    number,
    commitState: r.commitState,
    hash: typeof r.hash === "string" ? r.hash : undefined,
    gasUsed: hex(r.gasUsed),
    gasLimit: hex(r.gasLimit),
  };
}
