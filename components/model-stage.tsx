"use client";

import {
  Suspense, createContext, useContext, useMemo, useRef, useEffect, useState, useCallback,
} from "react";
import { Canvas } from "@react-three/fiber";
import { View, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/cn";

/**
 * Every model preview on the page, drawn by one renderer.
 *
 * Each preview used to be its own <Canvas>, which is its own WebGL context.
 * The inventory shows the whole library and the post form shows every payload,
 * landmark and room to choose between — 43 contexts on a page, against a
 * browser limit that is nearer 16. Over that line the browser starts dropping
 * the oldest context, so tiles go black in the order they were created, and on
 * weaker hardware the page loses the lot.
 *
 * drei's View draws many scenes through a single renderer, each into the
 * rectangle of a tracked element. One context, any number of tiles.
 *
 * The stage itself is a fixed, pointer-transparent layer: it must cover the
 * viewport because Views are positioned in screen space, and it must not eat
 * clicks because the tiles under it are buttons.
 */

/** How many previews are on screen. The renderer exists only while that is
 *  more than none, so a page with no tiles pays for no WebGL context. */
const StageCount = createContext<{ acquire: () => () => void } | null>(null);

export function ModelStageProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const acquire = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ acquire }), [acquire]);
  return (
    <StageCount.Provider value={value}>
      {children}
      {count > 0 ? <StageCanvas /> : null}
    </StageCount.Provider>
  );
}

function ModelMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const c = scene.clone(true);
    // Normalise: the library runs from a 12 mm pen to a 980 mm counter, so a
    // shared camera can only work if every model is fitted to the same box.
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const k = 1 / Math.max(size.x, size.y, size.z || 1);
    c.position.sub(centre);
    c.scale.setScalar(k);
    return c;
  }, [scene]);
  return <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />;
}

function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      if (ref.current) ref.current.rotation.y = ((t - start) / 1000) * 0.55;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <group ref={ref}>{children}</group>;
}

/** One model, drawn into the box this component occupies. */
export function ModelView({ url, className }: { url: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null!);
  const stage = useContext(StageCount);

  // Registering is what brings the shared renderer into existence; the last
  // preview to unmount takes it away again.
  useEffect(() => stage?.acquire(), [stage]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <View track={ref}>
        <hemisphereLight args={["#9a9a9a", "#101010", 1.1]} />
        <directionalLight position={[2, 3, 2]} intensity={1.7} />
        <directionalLight position={[-2, 1, -1.5]} intensity={0.5} color="#FF9A3D" />
        <Suspense fallback={null}>
          <Spin>
            <ModelMesh url={url} />
          </Spin>
        </Suspense>
      </View>
    </div>
  );
}

/** The one renderer. Fixed and pointer-transparent: Views are placed in screen
 *  space, so it has to cover the viewport, and the tiles beneath it are
 *  buttons, so it must not take their clicks. */
function StageCanvas() {
  return (
    <Canvas
      // pointerEvents has to be inline: react-three-fiber writes its own
      // inline pointer-events on this container, which beats a class, and a
      // full-viewport layer that takes clicks would make every tile beneath it
      // — all of which are buttons — unclickable.
      style={{ position: "fixed", inset: 0, zIndex: 5, pointerEvents: "none" }}
      camera={{ position: [1.6, 1.15, 1.7], fov: 34 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <View.Port />
    </Canvas>
  );
}
