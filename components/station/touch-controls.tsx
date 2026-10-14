"use client";

import { useEffect } from "react";

const moves = [["w", "Reach forward"], ["s", "Reach back"], ["a", "Move left"], ["d", "Move right"], ["e", "Lift"], ["q", "Lower"]] as const;
const keyEvent = (key: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key }));

/** Touch drives the same held-key input as the physical keyboard; the normal
 * simulation, recording and verifier still own the run. */
export function TouchControls() {
  useEffect(() => () => { for (const [key] of moves) keyEvent(key, false); }, []);
  return <div className="absolute bottom-24 left-3 right-3 grid grid-cols-3 gap-2 lg:hidden" aria-label="Arm touch controls">
    {moves.map(([key, label]) => <button
      key={key} type="button" className="touch-none border border-rule-strong bg-ink-1 px-2 py-3 text-sm text-scribe active:bg-signal-dim"
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); keyEvent(key, true); }}
      onPointerUp={() => keyEvent(key, false)} onPointerCancel={() => keyEvent(key, false)} onLostPointerCapture={() => keyEvent(key, false)}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); keyEvent(key, true); } }}
      onKeyUp={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); keyEvent(key, false); } }}
      onBlur={() => keyEvent(key, false)}
    >{label}</button>)}
    <button type="button" className="col-span-3 border border-rule-strong bg-ink-1 px-3 py-3 text-sm text-scribe" onClick={() => { keyEvent(" ", true); keyEvent(" ", false); }}>Open / close jaws</button>
    <p className="col-span-3 bg-ink-1 px-2 text-center text-xs text-scribe-2">Hold a direction to move. Tap jaws to grasp or release.</p>
  </div>;
}
