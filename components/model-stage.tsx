"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
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
 */
function ModelMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const c = scene.clone(true);
    // The library runs from a 12 mm pen to a 980 mm counter. A shared camera
    // can only frame all of that if every model is normalised to one box.
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const k = 1 / Math.max(size.x, size.y, size.z || 1);
    c.position.sub(centre);
    c.scale.setScalar(k);
    return c;
  }, [scene]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      if (ref.current) ref.current.rotation.y = ((t - start) / 1000) * 0.5;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <group ref={ref}>
      <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

export function ModelView({ url, className }: { url: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // No IntersectionObserver (old browser, odd embedding) means draw it rather
    // than leave a blank tile — correctness first, context budget second. The
    // timeout keeps that out of the effect's synchronous pass.
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className={cn("relative", className)}>
      {near ? (
        <Canvas
          camera={{ position: [1.5, 1.1, 1.6], fov: 34 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <hemisphereLight args={["#9a9a9a", "#101010", 1.15]} />
          <directionalLight position={[2, 3, 2]} intensity={1.8} />
          <directionalLight position={[-2, 1, -1.5]} intensity={0.5} color="#FF9A3D" />
          <Suspense fallback={null}>
            <ModelMesh url={url} />
          </Suspense>
        </Canvas>
      ) : null}
    </div>
  );
}

/** Kept so providers.tsx does not need to know how previews are drawn. */
export function ModelStageProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
