"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DimRule } from "@/components/primitives";
import { anchorFrom, frameFrom, toolAt, HAND_TO_BENCH, type Anchor } from "@/lib/handheld";
import { fmtInt, fmtSeconds } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Sample } from "@/lib/types";

const GOAL: [number, number] = [0.16, -0.18];
const START: [number, number] = [0.22, 0.14];
const TABLE_Z = 0, PAYLOAD_H = 0.075, CAPTURE_R = 0.09;
const GRIP_OPEN = 42, GRIP_SHUT = 6;
const HZ = 20;

type Phase = "idle" | "recording" | "done";

/**
 * Demonstrate by moving your phone.
 *
 * Mobile capture was named as a non-capability and I refused it twice on the
 * grounds that a phone cannot produce a usable trajectory. That was correct
 * about DeviceMotion — integrating accelerometer readings drifts to nonsense
 * in seconds — and wrong about the device. An `immersive-ar` session reports a
 * pose from the same visual-inertial tracking that places furniture in a room:
 * corrected against what the camera sees, not integrated. That is a real
 * six-degree-of-freedom measurement of where a hand went.
 *
 * So the phone is the gripper. What comes out is a trajectory in exactly the
 * format every other run uses, because a capture mode with its own format
 * would put a second kind of episode into a corpus meant to be trained on as
 * one thing.
 *
 * Two things this is not. It is not vision: nothing here sees a real object,
 * and the payload is the simulated one. And it is not verified on a device —
 * I have no phone to run it on, so what is checked is the mapping, the
 * clamping and the recorded format, not how it feels in the hand.
 */
export default function HandheldPage() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [deviationMm, setDeviationMm] = useState<number | null>(null);

  const samples = useRef<Sample[]>([]);
  const anchor = useRef<Anchor | null>(null);
  const object = useRef<[number, number, number]>([START[0], START[1], TABLE_Z]);
  const held = useRef(false);
  const grip = useRef(GRIP_OPEN);
  const started = useRef(0);
  const lastSample = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const xr = (navigator as Navigator & {
        xr?: { isSessionSupported: (m: string) => Promise<boolean> };
      }).xr;
      if (!xr?.isSessionSupported) { setSupported(false); return; }
      xr.isSessionSupported("immersive-ar").then(setSupported).catch(() => setSupported(false));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const record = useCallback((session: XRSession, refSpace: XRReferenceSpace) => {
    const onFrame = (time: number, frame: XRFrame) => {
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(refSpace);
      if (!pose) return;

      const p = pose.transform.position;
      anchor.current ??= anchorFrom(p);
      const elapsed = (time - started.current) / 1000;

      const tool = toolAt(p, anchor.current);
      const o = object.current;

      // The same grasp rule the station uses, so a handheld demonstration and
      // a driven one mean the same thing by "holding".
      const planar = Math.hypot(tool[0] - o[0], tool[1] - o[1]);
      const withinHeight = tool[2] > o[2] - 0.02 && tool[2] < o[2] + PAYLOAD_H + 0.055;
      if (!held.current && grip.current <= 14 && planar < CAPTURE_R && withinHeight) held.current = true;
      if (held.current && grip.current > 14) held.current = false;

      if (held.current) {
        o[0] = tool[0]; o[1] = tool[1];
        o[2] = Math.max(TABLE_Z, tool[2] - PAYLOAD_H / 2);
      } else if (o[2] > TABLE_Z) {
        o[2] = Math.max(TABLE_Z, o[2] - 0.9 / HZ);
      }

      // Sampled at the recorder's rate rather than the display's: a phone
      // running at 90 Hz would otherwise produce episodes four times longer
      // than a desk one for the same motion.
      if (elapsed - lastSample.current >= 1 / HZ) {
        lastSample.current = elapsed;
        samples.current.push(frameFrom(elapsed, p, anchor.current, grip.current, o));
        setFrames(samples.current.length);
        setSeconds(elapsed);
        setDeviationMm(Math.hypot(o[0] - GOAL[0], o[1] - GOAL[1]) * 1000);
      }
    };
    session.requestAnimationFrame(onFrame);
  }, []);

  const start = async () => {
    setError(null);
    const xr = (navigator as Navigator & {
      xr?: { requestSession: (m: string, o?: unknown) => Promise<XRSession> };
    }).xr;
    if (!xr) return;
    try {
      const session = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
      });
      const refSpace = await session.requestReferenceSpace("local-floor");

      samples.current = [];
      anchor.current = null;
      object.current = [START[0], START[1], TABLE_Z];
      held.current = false;
      grip.current = GRIP_OPEN;
      started.current = performance.now();
      lastSample.current = 0;
      setPhase("recording");

      // A tap closes the jaws and the next opens them. On a phone there is one
      // input and it has to do the one thing the keyboard's space bar does.
      session.addEventListener("select", () => {
        grip.current = grip.current > 14 ? GRIP_SHUT : GRIP_OPEN;
      });
      session.addEventListener("end", () => setPhase("done"));

      record(session, refSpace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The device refused the session.");
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({
      recorded_with: "handheld immersive-ar pose",
      control_frequency_hz: HZ,
      hand_to_bench_scale: HAND_TO_BENCH,
      note: "Poses come from the device's own tracking, not from integrating acceleration. The payload and the bench are simulated; nothing here sees a real object.",
      frames: samples.current.length,
      samples: samples.current,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `handheld-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-[820px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">
        Demonstrate by hand
      </h1>
      <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Hold your phone as though it were the gripper and move it. The pose comes
        from the device&rsquo;s own tracking &mdash; the same visual-inertial
        system that places furniture in a room, corrected against what the camera
        sees rather than integrated from acceleration, which is why this can be a
        measurement and a motion sensor could not.
      </p>
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        A hand metre becomes {Math.round(HAND_TO_BENCH * 100)} cm of bench, because the arm reaches 408 mm and
        a person demonstrating at arm&rsquo;s length moves through about a metre.
        Tap to close the jaws, tap again to let go. What comes out is a
        trajectory in the same format as every other run.
      </p>

      <DimRule className="mt-8" />

      {supported === null ? (
        <p className="mt-6 font-mono text-[13px] text-scribe-3">Checking this device…</p>
      ) : !supported ? (
        <div className="mt-6 border border-rule px-5 py-6">
          <p className="text-[15px] text-scribe-2">This device cannot start an AR session.</p>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
            Handheld capture needs a phone or tablet whose browser supports
            WebXR <code className="font-mono">immersive-ar</code>. On anything
            else the station&rsquo;s pointer, keyboard and voice controls record
            exactly the same trajectory format.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <button
            type="button"
            onClick={start}
            disabled={phase === "recording"}
            className={cn(
              "self-start border px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors",
              phase === "recording"
                ? "border-signal text-signal"
                : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
            )}
          >
            {phase === "recording" ? "Recording" : "Start capture"}
          </button>

          {error ? <p className="font-mono text-[12px] text-reject">{error}</p> : null}

          {phase !== "idle" ? (
            <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-3">
              {([
                ["Frames", frames ? fmtInt(frames) : "—"],
                ["Length", frames ? fmtSeconds(seconds) : "—"],
                ["From the datum", deviationMm === null ? "—" : `${deviationMm.toFixed(0)} mm`],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 bg-ink-1 px-3 py-3">
                  <span className="label">{label}</span>
                  <span className="font-mono text-[15px] tabular-nums text-scribe">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {phase === "done" && frames > 0 ? (
            <button
              type="button"
              onClick={download}
              className="self-start border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] hover:border-signal hover:text-signal"
            >
              Download the episode
            </button>
          ) : null}
        </div>
      )}

      <DimRule className="mt-10" note="What this is not" />
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        It is not vision. Nothing here sees a real object: the payload, the bench
        and the datum are the simulated ones, and the phone supplies a hand pose
        rather than a scene. And it is not verified on a device &mdash; the
        mapping, the clamping at the arm&rsquo;s reach and the recorded format
        are tested, but I have no phone to run it on, so how it feels in the hand
        is unknown.
      </p>
    </div>
  );
}
