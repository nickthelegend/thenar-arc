"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { LeaderPanel } from "@/components/station/leader-panel";
import { MirrorPanel } from "@/components/station/arm-link";
import { ENTER_XR, XR_STATE, lastXrState, type XrStateDetail } from "@/components/station/xr";

type Mode = "keys" | "leader" | "quest";
const KEY = "thenar:drive-with";

/** Whether this browser can open a headset session, and which kinds. */
function useXrSupport() {
  const [s, set] = useState<{ vr: boolean; mr: boolean }>({ vr: false, mr: false });
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) return;
    Promise.all([xr.isSessionSupported("immersive-vr").catch(() => false), xr.isSessionSupported("immersive-ar").catch(() => false)])
      .then(([vr, mr]) => set({ vr, mr }));
  }, []);
  return s;
}

/**
 * How the operator drives the arm: the keyboard, a physical leader arm, or a
 * Meta Quest 3S. One choice, one small panel, remembered between visits.
 */
export function DriveWith({ taskId, so101 }: { taskId: number; so101: boolean }) {
  const xr = useXrSupport();
  const [mode, setMode] = useState<Mode>("keys");
  useEffect(() => {
    // A headset, or a link opened from one, starts on the Quest panel.
    const fromHeadset = new URLSearchParams(location.search).has("headset") || /OculusBrowser|Quest/i.test(navigator.userAgent);
    let saved: Mode | null = null;
    try { saved = localStorage.getItem(KEY) as Mode | null; } catch { /* private window */ }
    const t = setTimeout(() => setMode(fromHeadset ? "quest" : saved && (saved !== "leader" || so101) ? saved : "keys"), 0);
    return () => clearTimeout(t);
  }, [so101]);
  const pick = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* private window */ }
  };
  const tabs: { id: Mode; label: string }[] = [
    { id: "keys", label: "Keyboard" },
    ...(so101 ? [{ id: "leader" as const, label: "Leader" }] : []),
    { id: "quest", label: "Quest 3S" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => pick(t.id)}
            className={cn(
              "whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition-colors duration-300",
              mode === t.id ? "bg-white/10 text-white" : "text-scribe-3 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "keys" ? <Keys /> : null}
      {mode === "leader" ? (
        <div className="flex flex-col gap-4">
          <LeaderPanel />
          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-scribe-3 hover:text-white">
              Also move a real SO-101 <span className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-3"><MirrorPanel /></div>
          </details>
        </div>
      ) : null}
      {mode === "quest" ? <Quest taskId={taskId} xr={xr} /> : null}
    </div>
  );
}

function Keys() {
  const rows: [string[], string][] = [
    [["W", "S"], "Reach out, pull in"],
    [["A", "D"], "Swing left, right"],
    [["E", "Q"], "Raise, lower"],
    [["Space"], "Open or close the jaws"],
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([keys, what]) => (
        <div key={what} className="flex items-center justify-between gap-3">
          <span className="flex gap-1">
            {keys.map((k) => (
              <kbd key={k} className="min-w-[26px] rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-center font-mono text-xs text-scribe-2">{k}</kbd>
            ))}
          </span>
          <span className="text-xs text-scribe-3">{what}</span>
        </div>
      ))}
      <p className="text-xs text-scribe-3">Or drag in the scene to move the tool.</p>
    </div>
  );
}

function Quest({ taskId, xr }: { taskId: number; xr: { vr: boolean; mr: boolean } }) {
  const [link, setLink] = useState(`app.thenar.io/q/${taskId}`);
  useEffect(() => {
    const host = location.host.startsWith("localhost") || location.host.startsWith("127.") ? location.host : "app.thenar.io";
    const t = setTimeout(() => setLink(`${host}/q/${taskId}`), 0);
    return () => clearTimeout(t);
  }, [taskId]);
  const [state, setState] = useState<XrStateDetail>(() => lastXrState.current);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<XrStateDetail>).detail);
    window.addEventListener(XR_STATE, on);
    return () => window.removeEventListener(XR_STATE, on);
  }, []);
  const enter = (mode: "mr" | "vr") => window.dispatchEvent(new CustomEvent(ENTER_XR, { detail: mode }));

  if (xr.mr || xr.vr) {
    return (
      <div className="flex flex-col gap-3">
        {xr.mr && state.mode !== "vr" ? (
          <button type="button" onClick={() => enter("mr")} disabled={!!state.mode || !state.ready}
            className="rounded-lg bg-lilac px-4 py-3 text-sm font-semibold text-black transition duration-300 hover:bg-white active:scale-[0.98] disabled:opacity-70">
            {state.mode === "mr" ? "In the headset" : state.ready ? "Put it on my table" : "Loading the arm…"}
          </button>
        ) : null}
        {xr.vr && state.mode !== "mr" ? (
          <button type="button" onClick={() => enter("vr")} disabled={!!state.mode || !state.ready}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/5 disabled:opacity-70">
            {state.mode === "vr" ? "In the headset" : "Enter in VR"}
          </button>
        ) : null}
        {state.failed ? <p className="text-xs text-reject">{state.failed}</p> : null}
        <Steps />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-scribe-3">In your Quest 3S browser, open</p>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(`https://${link}`)}
        title="Copy"
        className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-3 text-left font-mono text-sm text-white transition-colors hover:border-white/30"
      >
        {link}
      </button>
      <Steps />
    </div>
  );
}

function Steps() {
  return (
    <ol className="flex flex-col gap-1.5 text-xs text-scribe-3">
      <li><span className="text-scribe-2">1.</span> Point at your table, pull the trigger: the arm stands there.</li>
      <li><span className="text-scribe-2">2.</span> Hold grip to take the arm. The trigger closes the jaws.</li>
      <li><span className="text-scribe-2">3.</span> A starts and ends a run. B moves the arm.</li>
    </ol>
  );
}
