"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Everything on this site, one keystroke away.
 *
 * There are twenty-odd surfaces here and the nav holds six of them. The rest —
 * a run by its hash, an operator by their address, the spec, the archive — are
 * reachable only by knowing where they are, which is fine for the person who
 * built it and useless to anyone being shown it for the first time.
 *
 * Tasks and runs are in here alongside the pages because they are the things
 * worth navigating to. A hash pasted in goes straight to that run, which is
 * the one lookup this product exists to make easy: someone hands you a payout
 * and you want to see what it was for.
 */

type Item = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
};

const PAGES: Item[] = [
  { id: "p-hub", label: "Open work", hint: "every funded task", href: "/hub", group: "Pages" },
  { id: "p-floor", label: "The floor", hint: "rooms you can join", href: "/space", group: "Pages" },
  { id: "p-corpus", label: "The corpus", hint: "every episode, across every task", href: "/corpus", group: "Pages" },
  { id: "p-pol", label: "Policies", hint: "models, ranked by what they actually did", href: "/policies", group: "Pages" },
  { id: "p-inv", label: "Inventory", hint: "every object a task can use", href: "/inventory", group: "Pages" },
  { id: "p-lead", label: "Operators", hint: "the standings", href: "/leaderboard", group: "Pages" },
  { id: "p-found", label: "Foundry", hint: "minted policies and cap tables", href: "/foundry", group: "Pages" },
  { id: "p-contracts", label: "Contracts", hint: "every deployed contract, read live", href: "/contracts", group: "Pages" },
  { id: "p-l1", label: "The L1", hint: "three claims that need a chain of our own", href: "/l1", group: "Pages" },
  { id: "p-port", label: "Portfolio", hint: "your own runs", href: "/portfolio", group: "Pages" },
  { id: "p-status", label: "Status", hint: "what has to be true for a run to pay", href: "/status", group: "Pages" },
  { id: "p-spec", label: "Spec sheet", hint: "the arm, in numbers", href: "/spec", group: "Pages" },
  { id: "p-archive", label: "Archive", hint: "runs on superseded deployments", href: "/archive", group: "Pages" },
  { id: "p-changelog", label: "Changelog", href: "/changelog", group: "Pages" },
  { id: "p-post", label: "Post a note", href: "/post", group: "Pages" },
  { id: "p-passkey", label: "Passkey", href: "/passkey", group: "Pages" },
];

/** Subsequence match, the thing everyone means by fuzzy: "ptc" finds "Put the
 *  crate". Scored by how early and how tightly the letters land, so an exact
 *  prefix beats a scatter across the string. */
function score(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let at = 0;
  let total = 0;
  let last = -1;
  for (const ch of n) {
    const i = h.indexOf(ch, at);
    if (i < 0) return null;
    total += i - last === 1 ? 0 : i - at + 1;
    last = i;
    at = i + 1;
  }
  return total;
}

export function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { tasks } = useTaskCatalogue();

  /**
   * Closing is where the query is cleared, not opening.
   *
   * Resetting on open meant setting state from inside an effect, which makes
   * React render again before it has painted the render it is already in. It
   * is also the wrong moment: nothing is on screen while this is closed, so
   * clearing then is free, where clearing on open is a frame of the last
   * search still visible.
   */
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setCursor(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    // After paint: the field is not in the document to be focused until then.
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const fromTasks: Item[] = (tasks ?? []).map((t) => ({
      id: `t-${t.id}`,
      label: t.name,
      hint: `task #${t.id} · ${t.slotsFilled}/${t.slotsTotal} filled`,
      href: `/task/${t.id}`,
      group: "Tasks",
    }));
    const drive: Item[] = (tasks ?? [])
      .filter((t) => t.open)
      .map((t) => ({
        id: `d-${t.id}`,
        label: `Run: ${t.name}`,
        hint: `open the station for task #${t.id}`,
        href: `/station/${t.id}`,
        group: "Drive",
      }));
    return [...PAGES, ...fromTasks, ...drive];
  }, [tasks]);

  /** A pasted hash or address is a destination, not a search. */
  const direct = useMemo<Item | null>(() => {
    const v = q.trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(v)) {
      return { id: "direct-run", label: `Open run ${shortHash(v)}`, href: `/run/${v}`, group: "Go to", hint: "trajectory hash" };
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) {
      return { id: "direct-op", label: `Open operator ${shortHash(v)}`, href: `/operator/${v}`, group: "Go to", hint: "address" };
    }
    if (/^#?\d+$/.test(v)) {
      const n = v.replace("#", "");
      return { id: "direct-task", label: `Open task #${n}`, href: `/task/${n}`, group: "Go to", hint: "task id" };
    }
    return null;
  }, [q]);

  const shown = useMemo(() => {
    const ranked = items
      .map((it) => ({ it, s: score(`${it.label} ${it.hint ?? ""}`, q.trim()) }))
      .filter((r): r is { it: Item; s: number } => r.s !== null)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map((r) => r.it);
    return direct ? [direct, ...ranked] : ranked;
  }, [items, q, direct]);

  const go = useCallback((it: Item) => {
    close();
    router.push(it.href);
  }, [close, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-0/80 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Search this site"
    >
      <div
        className="w-full max-w-[560px] border border-rule-strong bg-ink-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === "Enter" && shown[cursor]) { e.preventDefault(); go(shown[cursor]); }
          }}
          placeholder="Search, or paste a run hash or an address"
          aria-label="Search"
          className="w-full border-b border-rule bg-transparent px-4 py-3 font-mono text-[14px] text-scribe placeholder:text-scribe-3 focus:outline-none"
        />

        {shown.length === 0 ? (
          <p className="px-4 py-6 font-mono text-[13px] text-scribe-3">
            Nothing matches “{q}”. A run hash or an address opens directly.
          </p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto py-1">
            {shown.map((it, i) => {
              const first = i === 0 || shown[i - 1].group !== it.group;
              return (
                <li key={it.id}>
                  {first ? (
                    <span className="block px-4 pb-1 pt-3 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">
                      {it.group}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it)}
                    className={cn(
                      "flex w-full items-baseline gap-3 px-4 py-2 text-left",
                      i === cursor ? "bg-signal-dim text-signal-hi" : "text-scribe-2 hover:bg-ink-2",
                    )}
                  >
                    <span className="truncate text-[14px]">{it.label}</span>
                    {it.hint ? (
                      <span className="ml-auto shrink-0 font-mono text-[12px] text-scribe-3">{it.hint}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-4 border-t border-rule px-4 py-2 font-mono text-[12px] text-scribe-3">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
