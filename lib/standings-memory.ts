"use client";

/**
 * What the standings looked like last time you saw them.
 *
 * A rank on its own is a number. A rank that moved is news, and the chain
 * cannot tell you that — it stores the current state, not the reader's last
 * view of it. This keeps the previous ordering for this tab so a change since
 * you last looked can be shown, and it is explicitly a view aid: it never feeds
 * a score, a payout or anything written anywhere.
 */

const KEY = "thenar:standings:v1";

export type Seen = Record<string, number>;

export function readSeen(): Seen {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    return {};
  }
}

export function writeSeen(order: { address: string }[]) {
  try {
    const map: Seen = {};
    order.forEach((o, i) => { map[o.address.toLowerCase()] = i + 1; });
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // A rank delta is not worth failing the page over.
  }
}

/** Positive means climbed, negative means dropped, null means unseen before. */
export function delta(seen: Seen, address: string, rank: number): number | null {
  const was = seen[address.toLowerCase()];
  if (!was) return null;
  return was - rank;
}
