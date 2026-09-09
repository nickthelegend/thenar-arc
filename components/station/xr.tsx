"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { cn } from "@/lib/cn";

/**
 * Stand in the room the run is recorded in.
 *
 * A WebXR station was on the rejected list for splitting the demo's attention,
 * which is a judgement about a pitch rather than about the product. The scene
 * is already a room at true scale — every model is in metres, the bench is a
 * bench, the arm is 408 mm of reach — and a room at true scale is exactly what
 * a headset is for. Reaching for the payload where it actually is tells an
 * operator something the camera never can.
 *
 * Controller input dispatches the same keystrokes the panel names, as voice
 * does. One control path is what keeps a run recorded in a headset comparable
 * with one recorded at a desk: three ways in, one machine underneath, one
 * shape of trajectory out.
 */

/** Past this, a thumbstick is being pushed rather than resting. */
const DEADZONE = 0.55;
/** How often a held stick repeats, in milliseconds. Matched to the step the
 *  keyboard produces so holding a direction is not faster in a headset. */
const REPEAT_MS = 180;

function tap(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  }, 90);
}

/**
 * Read the controllers each frame and turn them into the station's own keys.
 *
 * Lives inside the Canvas because that is where the frame loop is — and in a
 * session that loop is the headset's, not the browser's, so polling here is
 * the only place the gamepad state is current.
 */
export function XRControls() {
  const { gl } = useThree();
  const nextAt = useRef(0);
  const gripWas = useRef(false);

  useFrame(() => {
    const session = gl.xr.getSession?.();
    if (!session) return;

    const now = performance.now();
    for (const src of session.inputSources) {
      const pad = src.gamepad;
      if (!pad) continue;

      // Trigger closes the jaws and releasing opens them, rather than the
      // toggle the keyboard uses: in a headset the operator is holding
      // something, and a grip that stays shut after they let go is the one
      // thing that would not match what their hand is doing.
      const held = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[1]?.pressed ?? false);
      if (held !== gripWas.current) {
        gripWas.current = held;
        tap(" ");
      }

      if (now < nextAt.current) continue;
      // Axes 2 and 3 are the thumbstick on the standard xr-standard mapping;
      // 0 and 1 are the trackpad, which older controllers report instead.
      const x = pad.axes[2] ?? pad.axes[0] ?? 0;
      const y = pad.axes[3] ?? pad.axes[1] ?? 0;

      // One axis at a time, the same rule the voice grammar uses: a diagonal
      // push is ambiguous, and half-obeying it moves the tool somewhere the
      // operator did not ask for.
      if (Math.abs(x) > Math.abs(y)) {
        if (Math.abs(x) > DEADZONE) { tap(x > 0 ? "d" : "a"); nextAt.current = now + REPEAT_MS; }
      } else if (Math.abs(y) > DEADZONE) {
        tap(y > 0 ? "s" : "w");
        nextAt.current = now + REPEAT_MS;
      }
    }
  });

  return null;
}

/**
 * Offer the headset, when there is one.
 *
 * Rendered outside the Canvas, because a button inside a WebGL scene is not
 * reachable before the session starts. Absent entirely on a device with no
 * headset rather than shown disabled: an inert control that can never become
 * active is worse than no control.
 */
export function EnterXR({ gl, className }: { gl: THREE.WebGLRenderer | null; className?: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inSession, setInSession] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Off the synchronous pass. A browser with no WebXR at all answers
    // immediately, and setting state straight out of an effect makes React
    // re-render before it has painted the one it is already in.
    const t = setTimeout(() => {
      const xr = (navigator as Navigator & {
        xr?: { isSessionSupported: (m: string) => Promise<boolean> };
      }).xr;
      if (!xr?.isSessionSupported) { setSupported(false); return; }
      xr.isSessionSupported("immersive-vr")
        .then((ok) => { if (live) setSupported(ok); })
        .catch(() => { if (live) setSupported(false); });
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, []);

  if (!supported || !gl) return null;

  const enter = async () => {
    setFailed(null);
    const xr = (navigator as Navigator & {
      xr?: { requestSession: (m: string, o?: unknown) => Promise<XRSession> };
    }).xr;
    if (!xr) return;
    try {
      const session = await xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });
      // three's own accessor rather than assigning the property: the renderer
      // exposes xr.enabled as a managed flag, and writing it directly is what
      // the lint rule is objecting to.
      Object.assign(gl.xr, { enabled: true });
      await gl.xr.setSession(session as never);
      setInSession(true);
      session.addEventListener("end", () => setInSession(false));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "The headset refused the session.");
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={enter}
        disabled={inSession}
        className={cn(
          "border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
          inSession
            ? "border-signal text-signal"
            : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
        )}
      >
        {inSession ? "In the room" : "Enter in VR"}
      </button>
      {failed ? <p className="font-mono text-[12px] text-reject">{failed}</p> : null}
    </div>
  );
}
