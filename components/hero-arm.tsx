"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { solve, toolPosition } from "@/lib/kinematics";

/**
 * The landing hero is the product doing its job: one pick-and-place cycle,
 * on a loop, driven by the same solver the station uses. It is not a render.
 */

const PICK: [number, number] = [0.3, 0.2];
const PLACE: [number, number] = [0.17, -0.24];
const CYCLE = 9.2; // seconds
/** The frame the arm holds on when motion is reduced: mid-traverse, extended. */
const HOLD_AT = CYCLE * 0.46;

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** The cycle as a keyframed tool path: approach, close, lift, traverse, set, release. */
function poseAt(time: number): { target: [number, number, number]; grip: number } {
  const t = (time % CYCLE) / CYCLE;
  const HIGH = 0.26;
  const LOW = 0.048;

  const seg = (a: number, b: number) => easeInOut(Math.min(1, Math.max(0, (t - a) / (b - a))));

  if (t < 0.16) {
    return { target: [PICK[0], PICK[1], HIGH - (HIGH - LOW) * seg(0.06, 0.16)], grip: 42 };
  }
  if (t < 0.24) return { target: [PICK[0], PICK[1], LOW], grip: 42 - 36 * seg(0.16, 0.24) };
  if (t < 0.34) {
    return { target: [PICK[0], PICK[1], LOW + (HIGH - LOW) * seg(0.24, 0.34)], grip: 6 };
  }
  if (t < 0.58) {
    const k = seg(0.34, 0.58);
    return {
      target: [
        PICK[0] + (PLACE[0] - PICK[0]) * k,
        PICK[1] + (PLACE[1] - PICK[1]) * k,
        HIGH,
      ],
      grip: 6,
    };
  }
  if (t < 0.68) {
    return { target: [PLACE[0], PLACE[1], HIGH - (HIGH - LOW) * seg(0.58, 0.68)], grip: 6 };
  }
  if (t < 0.76) return { target: [PLACE[0], PLACE[1], LOW], grip: 6 + 36 * seg(0.68, 0.76) };
  if (t < 0.86) {
    return { target: [PLACE[0], PLACE[1], LOW + (HIGH - LOW) * seg(0.76, 0.86)], grip: 42 };
  }
  const k = seg(0.86, 1);
  return {
    target: [
      PLACE[0] + (PICK[0] - PLACE[0]) * k,
      PLACE[1] + (PICK[1] - PLACE[1]) * k,
      HIGH,
    ],
    grip: 42,
  };
}

function Rig({ paused }: { paused: boolean }) {
  const { scene } = useGLTF("/models/thenar-6.glb");
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    return c;
  }, [scene]);
  const payload = useRef<THREE.Mesh>(null);
  const clock = useRef(0);

  // three.js objects are mutated every frame, so they live in a ref rather than
  // a memo: a memo's result is meant to be treated as immutable.
  const nodes = useRef<Record<string, THREE.Object3D | undefined>>({});
  useEffect(() => {
    const get = (n: string) => model.getObjectByName(n) ?? undefined;
    nodes.current = {
      j1: get("J1_yaw"),
      j2: get("J2_pitch"),
      j3: get("J3_pitch"),
      j5: get("J5_pitch"),
      jawL: get("jaw_left"),
      jawR: get("jaw_right"),
    };
  }, [model]);

  useFrame((_, dt) => {
    // A paused hero costs nothing: reduced-motion holds the arm mid-cycle.
    if (!paused) clock.current += dt;
    const { target, grip } = poseAt(paused ? HOLD_AT : clock.current);
    const j = solve(target);

    const n = nodes.current;
    if (n.j1) n.j1.rotation.z = j.j1;
    if (n.j2) n.j2.rotation.y = j.j2;
    if (n.j3) n.j3.rotation.y = j.j3;
    if (n.j5) n.j5.rotation.y = j.j5;
    if (n.jawL) n.jawL.position.x = -grip / 2000;
    if (n.jawR) n.jawR.position.x = grip / 2000;

    if (payload.current) {
      const tool = toolPosition(j);
      const held = grip < 14;
      const t = (paused ? HOLD_AT : clock.current) % CYCLE;
      const onPlace = t > 0.76 * CYCLE;
      const rest: [number, number] = onPlace ? PLACE : PICK;
      payload.current.position.set(
        held ? tool[0] : rest[0],
        held ? Math.max(0.037, tool[2] + 0.0) : 0.037,
        held ? tool[1] : rest[1],
      );
    }
  });

  // The arm's centroid sits ~0.26 m up; dropping the whole scene by that
  // much puts it on the origin the camera already points at, which frames the
  // working end instead of the empty table in front of it.
  return (
    <group position={[0, -0.22, 0]}>
      <hemisphereLight args={["#8F8F8F", "#000000", 0.46]} />
      <directionalLight position={[0.9, 1.3, 0.7]} intensity={2.4} castShadow />
      <directionalLight position={[-0.9, 0.4, -0.7]} intensity={0.5} color="#FF9A3D" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.5, 64]} />
        <meshStandardMaterial color="#0F0F0F" roughness={0.86} />
      </mesh>

      <mesh ref={payload} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.075, 24]} />
        <meshStandardMaterial color="#D6D8D2" roughness={0.4} metalness={0.2} />
      </mesh>

      <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

export function HeroArm() {
  const paused =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 32, position: [0.72, 0.42, 0.68], near: 0.02, far: 12 }}
      style={{ background: "transparent" }}
      aria-label="An THENAR-6 arm running a pick-and-place cycle"
    >
      <Rig paused={paused} />
    </Canvas>
  );
}
