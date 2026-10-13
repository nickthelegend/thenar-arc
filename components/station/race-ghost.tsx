"use client";

import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SO101 } from "@/lib/so101";
import { raceSampleAt } from "@/lib/race";
import { SO101_URL } from "@/components/station/so101-arm";
import type { ReplaySample } from "@/components/station/replay";

/**
 * The task's best paid run, as a translucent SO-101 moving beside the
 * operator's own arm, in step with the operator's run.
 *
 * Posed from the recording's own joint angles, the way /run replays it, at
 * the time the operator's run has reached: when the operator begins, the
 * ghost begins. It is drawn and nothing else: it is not scored, not
 * recorded, and a run measures the same with it on or off.
 */

export type Race = { hash: string; score: number; seconds: number; samples: ReplaySample[] };

const D2R = Math.PI / 180;
const GHOST = "#B9A2FF";

export function RaceGhost({ race, elapsed }: { race: Race | null; elapsed: number }) {
  const { scene } = useGLTF(SO101_URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    const glass = new THREE.MeshStandardMaterial({ color: GHOST, transparent: true, opacity: 0.26, depthWrite: false, roughness: 0.6 });
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = glass; m.castShadow = false; m.receiveShadow = false; }
    });
    return c;
  }, [scene]);

  const nodes = useRef<(THREE.Object3D | undefined)[]>([]);
  useEffect(() => { nodes.current = SO101.joints.map((id) => model.getObjectByName(id) ?? undefined); }, [model]);

  const ball = useRef<THREE.Mesh>(null);

  // Per-frame posing writes to refs and scene nodes, never to React state.
  useFrame(() => {
    if (!race?.samples.length) return;
    // Use the same clock the station displays. A separate wall clock drifts
    // on pause/completion and starts from zero if racing is enabled mid-run.
    const s = raceSampleAt(race.samples, elapsed);
    if (!s) return;
    if (s.q) {
      for (let i = 0; i < 6; i++) {
        const [lo, hi] = SO101.limitsDeg[i];
        const n = nodes.current[i];
        if (n) n.rotation.z = Math.min(hi, Math.max(lo, (s.q[i] ?? 0) / D2R)) * D2R;
      }
    }
    if (ball.current) ball.current.position.set(s.object[0], s.object[2] + 0.02, -s.object[1]);
  });

  if (!race?.samples.length) return null;
  return (
    <group>
      <primitive object={model} scale={0.001} rotation={[-Math.PI / 2, 0, 0]} />
      {/* Where the best run had the payload at this moment. */}
      <mesh ref={ball}>
        <sphereGeometry args={[0.018, 20, 14]} />
        <meshStandardMaterial color={GHOST} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}
