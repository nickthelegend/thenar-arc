"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { So101Arm, type So101Joints } from "@/components/station/so101-arm";
import { MirrorPanel } from "@/components/station/arm-link";
import { SurfacePlate } from "@/components/station/viewport";
import { SO101 } from "@/lib/so101";
import { sceneColor } from "@/lib/theme-color";

const D2R = Math.PI / 180;

function Camera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0.7, 0.52, 0.72);
    camera.lookAt(0.1, 0.08, 0);
  }, [camera]);
  return null;
}

/**
 * The SO-101 on its own bench: put the gripping point anywhere and watch the
 * CAD chain solve for it, with the joints it chose read back underneath. The
 * same solver and the same component the station drives on an SO-101 task,
 * and the same mirror to a real arm.
 */
export function So101Bench() {
  const [xyz, setXyz] = useState<[number, number, number]>([0.22, 0.05, 0.08]);
  const [jaw, setJaw] = useState(30);
  const target = useRef<[number, number, number]>(xyz);
  const grip = useRef(jaw);
  useEffect(() => {
    target.current = xyz;
    grip.current = jaw;
  }, [xyz, jaw]);
  const [j, setJ] = useState<So101Joints | null>(null);
  const tick = useRef(0);

  const axis = (i: 0 | 1 | 2, label: string, lo: number, hi: number) => (
    <label className="flex items-center gap-3">
      <span className="w-5 font-mono text-[12px] text-scribe-3">{label}</span>
      <input
        type="range" min={lo} max={hi} step={1} value={Math.round(xyz[i] * 1000)}
        onChange={(e) => setXyz((p) => { const n = [...p] as [number, number, number]; n[i] = Number(e.target.value) / 1000; return n; })}
        className="flex-1 accent-[var(--color-signal)]"
        aria-label={`Tool ${label}, millimetres`}
      />
      <span className="w-16 text-right font-mono text-[13px] tabular-nums text-scribe">{Math.round(xyz[i] * 1000)} mm</span>
    </label>
  );

  return (
    <div className="grid gap-px bg-rule lg:grid-cols-[1fr_300px]">
      <div className="relative h-[420px] bg-ink-1 lg:h-auto lg:min-h-[460px]">
        <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 34, near: 0.02, far: 8 }} style={{ background: "var(--color-ink-1)" }}>
          <Camera />
          <hemisphereLight args={["#8F8F8F", "#000000", 0.5]} />
          <directionalLight position={[0.9, 1.25, 0.6]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-0.8, 0.5, -0.7]} intensity={0.45} color="#FFB877" />
          <SurfacePlate />
          <mesh position={[xyz[0], xyz[2], -xyz[1]]}>
            <sphereGeometry args={[0.006, 16, 16]} />
            <meshBasicMaterial color={sceneColor.signal()} />
          </mesh>
          <Suspense fallback={null}>
            <So101Arm
              target={target}
              grip={grip}
              onJoints={(next) => {
                // Read back at a readable rate, not every frame.
                if (++tick.current % 6 === 0) setJ(next);
              }}
            />
          </Suspense>
        </Canvas>
      </div>
      <div className="flex flex-col gap-4 bg-ink-1 p-4">
        <div className="flex flex-col gap-2">
          <span className="label">Gripping point</span>
          {axis(0, "X", 60, 400)}
          {axis(1, "Y", -300, 300)}
          {axis(2, "Z", 10, 300)}
          <label className="flex items-center gap-3">
            <span className="w-5 font-mono text-[12px] text-scribe-3">J</span>
            <input type="range" min={0} max={63} value={jaw} onChange={(e) => setJaw(Number(e.target.value))} className="flex-1 accent-[var(--color-signal)]" aria-label="Jaw opening, millimetres" />
            <span className="w-16 text-right font-mono text-[13px] tabular-nums text-scribe">{jaw} mm</span>
          </label>
        </div>
        <div className="flex flex-col gap-1" data-testid="so101-readout">
          <span className="label">Solved joints</span>
          {SO101.jointNames.map((n, i) => (
            <div key={n} className="flex items-baseline justify-between border-b border-rule py-1">
              <span className="text-[13px] text-scribe-2">{n}</span>
              <span className="font-mono text-[13px] tabular-nums text-scribe">{j ? `${(j.q[i] / D2R).toFixed(1)}°` : "—"}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-1">
            <span className="text-[13px] text-scribe-2">Reached within</span>
            <span className={`font-mono text-[13px] tabular-nums ${j?.clamped ? "text-reject" : "text-go"}`}>
              {j ? `${(Math.hypot(j.tool[0] - xyz[0], j.tool[1] - xyz[1], j.tool[2] - xyz[2]) * 1000).toFixed(1)} mm` : "—"}
            </span>
          </div>
        </div>
        <MirrorPanel />
      </div>
    </div>
  );
}
