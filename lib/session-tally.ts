"use client";

/**
 * What this sitting has come to.
 *
 * PRODUCT.md describes the operator's real scene as long and repetitive —
 * dozens of runs in a session — and the interface only ever showed one run at a
 * time. The portfolio shows lifetime totals from the chain, which is a
 * different question from "how am I doing right now".
 *
 * Session-scoped and client-side because that is exactly what it is: a tally of
 * this tab, not a claim about the chain. Every number here is also on chain
 * independently; this only saves the operator from doing arithmetic between
 * runs.
 */

const KEY = "thenar:session:v1";

export type Tally = {
  /** Runs measured this sitting, whether or not they were submitted. */
  measured: number;
  /** Runs the chain confirmed and paid. */
  paid: number;
  /** Sum of scores of measured runs, for a running mean. */
  scoreSum: number;
  /** AVAX actually received, from confirmed receipts. */
  earned: number;
  /** When this sitting started. */
  since: number;
};

const empty = (): Tally => ({ measured: 0, paid: 0, scoreSum: 0, earned: 0, since: Date.now() });

export function readTally(): Tally {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty();
    const t = JSON.parse(raw) as Tally;
    return typeof t.measured === "number" ? t : empty();
  } catch {
    return empty();
  }
}

function write(t: Tally) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch { /* not worth failing a run over */ }
}

/** A run was measured. Counted whether or not it is ever submitted, because
 *  the work happened either way. */
export function noteMeasured(score: number): Tally {
  const t = readTally();
  const next = { ...t, measured: t.measured + 1, scoreSum: t.scoreSum + score };
  write(next);
  return next;
}

/** The chain confirmed a payment. Only ever called from a settled receipt. */
export function notePaid(avax: number): Tally {
  const t = readTally();
  const next = { ...t, paid: t.paid + 1, earned: t.earned + avax };
  write(next);
  return next;
}

export const meanScore = (t: Tally) => (t.measured ? t.scoreSum / t.measured : 0);
export const minutes = (t: Tally) => Math.max(0, (Date.now() - t.since) / 60_000);
