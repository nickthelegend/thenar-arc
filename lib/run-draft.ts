"use client";

import type { Sample, Verdict } from "@/lib/types";

/**
 * A measured run, kept until it is submitted or abandoned.
 *
 * Between the measurement and the transaction there is a wallet prompt, and
 * that is where runs were lost: a reload, a wallet extension taking focus, a
 * tab restored by the browser, and the samples were gone with no way back. The
 * work is real by then — the arm has been driven and the score is decided — so
 * losing it is losing the operator's actual labour.
 *
 * sessionStorage, deliberately: a draft belongs to this tab and this sitting.
 * It is cleared the moment the run is submitted or explicitly discarded, and it
 * is never a substitute for the chain — a draft is only ever an unsent run.
 */

const KEY = "thenar:run-draft:v1";

export type RunDraft = {
  taskId: number;
  samples: Sample[];
  verdict: Verdict;
  durationSeconds: number;
  /** When the measurement was taken, so a stale draft can be recognised. */
  at: number;
};

/** Drafts older than this are not offered: the scene may have moved on. */
const MAX_AGE_MS = 60 * 60 * 1000;

export function saveDraft(d: RunDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // A full or disabled store is not worth failing a run over.
  }
}

export function loadDraft(taskId: number): RunDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as RunDraft;
    if (d.taskId !== taskId) return null;
    if (!Array.isArray(d.samples) || d.samples.length === 0) return null;
    if (Date.now() - d.at > MAX_AGE_MS) { clearDraft(); return null; }
    return d;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the draft simply outlives its usefulness.
  }
}
