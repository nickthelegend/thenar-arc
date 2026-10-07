"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { sceneColor } from "@/lib/theme-color";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GOAL_R, PAYLOAD_R, PAYLOAD_H, TABLE_HALF } from "@/components/station/viewport";
import { So101Pose } from "@/components/station/so101-arm";
import type { ArmKind } from "@/lib/scan";

/**
 * A recorded run, played back in the scene it was recorded in.
 *
 * The ledger could already tell you a run scored 0.83 and was paid for it. It
 * could not show you the run. Every sample carries the six joint angles, the jaw
 * opening and the payload pose, so the arm can be posed from the recording
 * rather than re-simulated — what you are watching is the trajectory the
 * contract paid for, not a reconstruction of it.
 *
 * Nothing here writes: the scrubber reads the same samples the hash is derived
 * from, so what is on screen is what would re-hash.
 */

export type ReplaySample = {
  t: number;
  q?: [number, number, number, number, number, number];
  grip: number;
  object: [number, number, number];
  /** Present only on a run recorded in a two-payload scene. */
  object2?: [number, number, number];
};

function Arm({ frame }: { frame: React.RefObject<ReplaySample | null> }) {
  const { scene } = useGLTF("/models/thenar-6.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const nodes = useRef<Record<string, THREE.Object3D | undefined>>({});

  useEffect(() => {
    const get = (n: string) => model.getObjectByName(n) ?? undefined;
    nodes.current = {
      j1: get("J1_yaw"), j2: get("J2_pitch"), j3: get("J3_pitch"),
      j5: get("J5_pitch"), jawL: get("jaw_left"), jawR: get("jaw_right"),
    };
  }, [model]);

  // Posed from the recording on every change of frame, not on an animation
  // frame: the scrubber is the clock here, and a dragged scrubber has to track
  // even in a tab the browser has stopped painting continuously.
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const f = frame.current;
      const n = nodes.current;
      if (f?.q) {
        if (n.j1) n.j1.rotation.z = f.q[0];
        if (n.j2) n.j2.rotation.y = f.q[1];
        if (n.j3) n.j3.rotation.y = f.q[2];
        if (n.j5) n.j5.rotation.y = f.q[4];
      }
      if (f) {
        const half = f.grip / 2000;
        if (n.jawL) n.jawL.position.x = -half;
        if (n.jawR) n.jawR.position.x = half;
      }
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [frame]);

  return <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />;
}

function Payload({ frame, url, widthMm, slot = 0 }: {
  frame: React.RefObject<ReplaySample | null>; url: string; widthMm: number;
  /** Which object column of the recording this model follows. */
  slot?: number;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const f = frame.current;
      const o = slot === 0 ? f?.object : f?.object2;
      if (ref.current && f && o) {
        ref.current.position.set(o[0], o[2] + PAYLOAD_H / 2, -o[1]);
      }
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [frame]);

  // Already metres, like every model here.
  const k = (PAYLOAD_R * 2) / (widthMm / 1000);
  return (
    <group ref={ref}>
      <primitive object={model} position={[0, -PAYLOAD_H / 2, 0]}
                 rotation={[-Math.PI / 2, 0, 0]} scale={[k, k, k]} />
    </group>
  );
}

function Landmark({ url, widthMm, at }: { url: string; widthMm: number; at: [number, number] }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const k = (GOAL_R * 1.7) / (widthMm / 1000);
  return (
    <primitive object={model} position={[at[0], 0, -at[1]]}
               rotation={[-Math.PI / 2, 0, 0]} scale={[k, k, k]} />
  );
}

function Room({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0025, 0]} />;
}

function Plate() {
  const grid = useMemo(() => {
    const pts: number[] = [];
    const step = TABLE_HALF / 6;
    for (let i = -6; i <= 6; i += 1) {
      const v = i * step;
      pts.push(-TABLE_HALF, 0.0006, v, TABLE_HALF, 0.0006, v);
      pts.push(v, 0.0006, -TABLE_HALF, v, 0.0006, TABLE_HALF);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <boxGeometry args={[TABLE_HALF * 2, TABLE_HALF * 2, 0.001]} />
        <meshStandardMaterial color="#141414" roughness={0.84} metalness={0.06} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={sceneColor.ruleStrong()} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

/** The path already travelled, up to the scrubbed frame. */
function Trail({ points }: { points: Float32Array }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color={sceneColor.signal()} transparent opacity={0.75} />
    </line>
  );
}

export function ReplayViewport({
  frame, trail, payloads, targetUrl, targetWidthMm, environmentUrl, goal, arm = "thenar6",
}: {
  /** Which arm recorded the run: its joints only mean anything on that arm. */
  arm?: ArmKind;
  frame: React.RefObject<ReplaySample | null>;
  trail: Float32Array;
  /** Every payload the run was recorded against, in the order it placed them. */
  payloads: { url: string; widthMm: number }[];
  targetUrl: string; targetWidthMm: number;
  environmentUrl?: string;
  goal: [number, number];
}) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 34, near: 0.02, far: 12, position: [0.92, 0.74, 0.9] }}
      onCreated={({ camera }) => camera.lookAt(0.06, 0.12, 0.02)}
      gl={{ antialias: true }}
      style={{ background: "var(--color-ink-1)" }}
    >
      <hemisphereLight args={["#8F8F8F", "#000000", 0.4]} />
      <directionalLight position={[0.9, 1.25, 0.6]} intensity={2.3} castShadow />
      <directionalLight position={[-0.8, 0.5, -0.7]} intensity={0.45} color="#FFB877" />
      <Suspense fallback={null}>
        {environmentUrl ? <Room url={environmentUrl} /> : null}
        <Plate />
        <Landmark url={targetUrl} widthMm={targetWidthMm} at={goal} />
        {payloads.map((p, i) => (
          <Payload key={`${p.url}-${i}`} slot={i} frame={frame} url={p.url} widthMm={p.widthMm} />
        ))}
        {arm === "so101" ? <So101Pose frame={frame} /> : <Arm frame={frame} />}
      </Suspense>
      <Trail points={trail} />
    </Canvas>
  );
}
