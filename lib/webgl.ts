"use client";

/**
 * Whether this browser can draw the station at all.
 *
 * The viewport is the product: without WebGL there is no arm, no datum and no
 * recording. Until now the failure mode was a react-three-fiber exception into
 * the route's error boundary, which tells a visitor that something went wrong
 * and nothing about what they were looking at or why they cannot see it.
 *
 * Probed on a throwaway canvas rather than by sniffing the browser. Support is
 * a property of the machine, the driver and the user's own settings — Safari
 * behind a strict privacy extension, an old integrated GPU on a blocklist, a
 * remote desktop with no acceleration — and the only reliable question is
 * whether a context can actually be created here, now.
 */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    // Some environments hand back a context that immediately reports itself
    // lost, which is not support in any sense the station can use.
    const lost = (gl as WebGLRenderingContext).isContextLost?.();
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return !lost;
  } catch {
    return false;
  }
}
