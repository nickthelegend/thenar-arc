"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/cn";
import type { Prop } from "@/lib/props";

/**
 * One prop, rendered from the GLB the station will actually load.
 *
 * The preview is the same asset the run uses, not a picture of it — a thumbnail
 * that drifts from the model is how a funder ends up escrowing against a scene
 * they never saw.
 */
function PropMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const c = scene.clone(true);
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

export function PropPreview({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Canvas camera={{ position: [1.5, 1.1, 1.6], fov: 34 }} dpr={[1, 2]} frameloop="demand">
        <Suspense fallback={null}>
          <Stage intensity={0.45} environment={null} adjustCamera={1.1} shadows={false}>
            <PropMesh url={url} />
          </Stage>
        </Suspense>
        <hemisphereLight args={["#9a9a9a", "#101010", 1.1]} />
        <directionalLight position={[2, 3, 2]} intensity={1.6} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1.6} />
      </Canvas>
    </div>
  );
}

/** A row of props to choose between, each previewed as the model it is. */
export function PropPicker({
  label, hint, options, value, onChange,
}: {
  label: string;
  hint: string;
  options: Prop[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="border-t border-rule py-5">
      <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">{label}</div>
      <p className="mb-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">{hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {options.map((p) => {
          const on = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p.id)}
              className={cn(
                "group flex flex-col overflow-hidden border text-left transition-colors",
                on ? "border-signal bg-signal-dim" : "border-rule bg-ink-2 hover:border-rule-strong",
              )}
            >
              <PropPreview url={p.url} className="h-[74px] w-full" />
              <span
                className={cn(
                  // The label step is the documented floor; a tile narrower
                  // than its own caption is a layout problem, not a type one.
                  "block truncate border-t px-2 py-1 font-mono text-[12px] leading-tight",
                  on ? "border-signal/40 text-signal-hi" : "border-rule text-scribe-3",
                )}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
