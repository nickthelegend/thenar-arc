"use client";

/**
 * Two clicks: one when the jaws take the payload, one when they let go.
 *
 * The grasp is the only moment in a run with no physical feedback — on a real
 * bench you would hear and feel it. These are synthesised rather than sampled:
 * a short filtered noise burst, which is what a jaw closing on a rigid object
 * actually sounds like, and it costs no asset to ship.
 *
 * Off by default and remembered per browser. Sound that starts without being
 * asked for is worse than no sound, and an operator running for an hour is the
 * one who gets to decide.
 */

const KEY = "thenar:sound:v1";

let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}

export function setSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* nothing to do */ }
  if (!on) { void ctx?.close(); ctx = null; }
}

/** Created on the first deliberate sound, because browsers refuse an
 *  AudioContext that was not started by a gesture. */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * @param kind `grasp` is lower and shorter — a jaw meeting a surface. `release`
 *   is brighter and decays a touch longer, the way letting go actually reads.
 */
export function click(kind: "grasp" | "release") {
  if (!soundOn()) return;
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const dur = kind === "grasp" ? 0.035 : 0.05;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // White noise under a steep exponential decay: a transient, not a tone.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, kind === "grasp" ? 9 : 6);
  }

  const src = c.createBufferSource();
  src.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = kind === "grasp" ? 1400 : 2600;
  filter.Q.value = 1.1;

  const gain = c.createGain();
  gain.gain.value = kind === "grasp" ? 0.16 : 0.11;

  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}
