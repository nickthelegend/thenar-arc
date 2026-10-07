"use client";

import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";

/**
 * One robot, to turn and look at. A single canvas is open at a time on the
 * products page, so the browser's WebGL context limit is never in play.
 */
function Model({ url, zUp }: { url: string; zUp?: boolean }) {
  const { scene } = useGLTF(url);
  // Some exports are trimmed for the web and carry no normals; light needs them.
  useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.geometry.attributes.normal) m.geometry.computeVertexNormals();
    });
  }, [scene]);
  return zUp ? <group rotation={[-Math.PI / 2, 0, 0]}><primitive object={scene} /></group> : <primitive object={scene} />;
}

/** Studio light from this page alone: no environment map fetched from a CDN. */
export function Lights() {
  return (
    <>
      <hemisphereLight args={["#ffffff", "#2a2a33", 1.6]} />
      <directionalLight position={[3, 5, 2]} intensity={3} />
      <directionalLight position={[-4, 2, -3]} intensity={1.2} color="#b9a2ff" />
      <directionalLight position={[0, 3, -5]} intensity={1} />
    </>
  );
}

/** A model on its own stage, inline: a product with no pictures shows its CAD. */
export function ModelStage({ url, className, zUp }: { url: string; className?: string; zUp?: boolean }) {
  return (
    <div className={className}>
      <Canvas camera={{ position: [1.6, 1.1, 1.8], fov: 35 }} dpr={[1, 2]}>
        <color attach="background" args={["#08080A"]} />
        <Lights />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.7}>
            <Model url={url} zUp={zUp} />
          </Bounds>
          <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={4} blur={2.4} far={2} />
        </Suspense>
        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.8} enableDamping enableZoom={false} />
      </Canvas>
    </div>
  );
}

export function ModelViewer({ url, onClose, name, zUp }: { url: string; name: string; onClose: () => void; zUp?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-2xl" role="dialog" aria-label={`${name} in 3D`}>
      <div className="relative h-[80vh] w-full max-w-[1100px] overflow-hidden rounded-3xl border border-white/10 bg-[#050507]">
        <Canvas camera={{ position: [1.6, 1.1, 1.8], fov: 35 }} dpr={[1, 2]}>
          <color attach="background" args={["#050507"]} />
          <Lights />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.4}>
              <Model url={url} zUp={zUp} />
            </Bounds>
            <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={4} blur={2.4} far={2} />
          </Suspense>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={0.8} enableDamping />
        </Canvas>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-5">
          <span className="text-sm text-scribe-2">{name} · drag to turn</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur transition-colors hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}
