"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/cn";

/**
 * One model, drawn only while it is near the viewport.
 *
 * Every tile used to be its own <Canvas>, which is its own WebGL context: the
 * inventory asked for 43 of them against a browser limit nearer 16, and past
 * that line the browser drops the oldest, so tiles go black in creation order.
 *
 * The fix was a single shared renderer with drei's View. It did not draw — the
 * tiles came back blank in a real browser — and a preview that renders nothing
 * is worse than one that costs a context. So: a canvas per tile again, but
 * mounted only while the tile is on screen, which bounds the live contexts to
 * what is actually visible rather than to the size of the library.
 *
 * `rootMargin` starts the load a screen early, so scrolling reveals a model
 * rather than an empty box that fills in late.
 *
 * That bound was still too loose to be one. Counted in a real browser on the
 * inventory: thirty canvases, sixteen alive and fourteen with their context
 * already taken away — because a screen of margin on a grid six tiles wide is
 * most of the library, and "visible" was never the limit that mattered. The
 * browser was still doing the evicting, still oldest-first, so the tiles that
 * went black were the ones at the top of the page the reader was looking at.
 *
 * So the limit is stated instead of hoped for. At most BUDGET tiles hold a
 * context, and when more want one the ones furthest from the middle of the
 * viewport give theirs up. The eviction is the same eviction; the difference
 * is that it now happens to whatever is furthest from being read, and a tile
 * that loses its slot unmounts and comes back rather than staying a dead
 * canvas that will never draw again.
 */

/**
 * The fix that holds: no tile owns a context at all.
 *
 * Budgeting contexts only moved the blank tiles around. With the real
 * photoscanned props the library passed forty models, a screen showed
 * eighteen, and four were always blank. So one renderer, never attached to
 * the page, draws each model once into a still and the tile shows the image.
 * One context for the whole library, however long it grows; a model is loaded
 * once, when its tile first comes near the viewport, and never again.
 */
const PX = 360;
const stills = new Map<string, Promise<string>>();
let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getStage() {
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(PX, PX, false);
  // What the per-tile <Canvas> did by default, so the stills look as the tiles did.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#9a9a9a", "#101010", 1.15));
  const key = new THREE.DirectionalLight("#ffffff", 1.8);
  key.position.set(2, 3, 2);
  const fill = new THREE.DirectionalLight("#FFB877", 0.5);
  fill.position.set(-2, 1, -1.5);
  scene.add(key, fill);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
  camera.position.set(1.5, 1.1, 1.6);
  camera.lookAt(0, 0, 0);
  stage = { renderer, scene, camera };
  return stage;
}

/** The model, Z-up source turned Y-up, centred and scaled to a unit box. */
function framed(source: THREE.Object3D): THREE.Object3D {
  const inner = source.clone(true);
  inner.rotation.set(-Math.PI / 2, 0, 0);
  // A quarter turn so a flat or long object is seen along its length.
  inner.rotateZ(0.55);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  inner.position.sub(box.getCenter(new THREE.Vector3()));
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(1 / Math.max(size.x, size.y, size.z || 1));
  return outer;
}

/** A still of the model at `url`, drawn once and kept for the page's life. */
function still(url: string): Promise<string> {
  const hit = stills.get(url);
  if (hit) return hit;
  const job = queue.then(async () => {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(url);
    const s = getStage();
    const model = framed(gltf.scene);
    s.scene.add(model);
    s.renderer.render(s.scene, s.camera);
    const png = s.renderer.domElement.toDataURL("image/png");
    s.scene.remove(model);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    return png;
  });
  // One draw at a time on the one renderer; a failure leaves the queue usable.
  queue = job.catch(() => undefined);
  stills.set(url, job);
  job.catch(() => stills.delete(url));
  return job;
}

export function ModelView({ url, className }: { url: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let live = true;
    const load = () => still(url).then((png) => live && setSrc(png), () => undefined);
    // No IntersectionObserver (old browser, odd embedding): draw it anyway.
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => { live = false; };
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        load();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [url]);

  return (
    <div ref={box} className={cn("relative", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: still drawn in the page, not an asset next/image can optimise
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      ) : null}
    </div>
  );
}

/** Kept so providers.tsx does not need to know how previews are drawn. */
export function ModelStageProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
