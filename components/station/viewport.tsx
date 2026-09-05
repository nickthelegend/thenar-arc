"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { REACH_MAX, solve, toolPosition } from "@/lib/kinematics";
import type { Sample } from "@/lib/types";

/* Scene constants, metres. The table height and goal radius are the two the
   scoring depends on, so they live here and nowhere else. */
export const TABLE_Z = 0.0;
export const TABLE_HALF = 0.42;
export const GOAL_R = 0.075;
export const PAYLOAD_R = 0.028;
export const PAYLOAD_H = 0.075;
export const CAPTURE_R = 0.055;
export const GRIP_CLOSED = 12; // mm jaw opening below which a grasp forms
export const GRIP_OPEN_MM = 42;
const SAMPLE_HZ = 20;

/** Where the tool starts every run, in the arm's own frame. */
const INITIAL_TARGET: [number, number, number] = [0.3, 0, 0.16];

export type Telemetry = {
  joints: { j1: number; j2: number; j3: number; j5: number; clamped: boolean };
  tool: [number, number, number];
  object: [number, number, number];
  grip: number;
  held: boolean;
  settled: boolean;
  deviationMm: number;
};

type ViewportProps = {
  running: boolean;
  goal: [number, number];
  start: [number, number];
  onTelemetry: (t: Telemetry) => void;
  onSample: (s: Sample) => void;
};

useGLTF.preload("/models/axon-6.glb");

function Arm({
  target,
  grip,
  onJoints,
}: {
  target: React.RefObject<[number, number, number]>;
  grip: React.RefObject<number>;
  onJoints: (j: ReturnType<typeof solve>) => void;
}) {
  const { scene } = useGLTF("/models/axon-6.glb");

  // One instance per mount; the GLB cache hands back a shared graph otherwise.
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

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

  useFrame(() => {
    const j = solve(target.current);
    const n = nodes.current;
    if (n.j1) n.j1.rotation.z = j.j1;
    if (n.j2) n.j2.rotation.y = j.j2;
    if (n.j3) n.j3.rotation.y = j.j3;
    if (n.j5) n.j5.rotation.y = j.j5;

    const half = grip.current / 2000; // mm -> m, per jaw
    if (n.jawL) n.jawL.position.x = -half;
    if (n.jawR) n.jawR.position.x = half;

    onJoints(j);
  });

  // The CAD frame is Z-up, as URDF is; three.js is Y-up.
  return <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />;
}

function SurfacePlate() {
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
        <meshStandardMaterial color="#2A312E" roughness={0.82} metalness={0.08} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#3A5270" transparent opacity={0.32} />
      </lineSegments>
    </group>
  );
}

/** The goal drawn as a tolerance zone: a circle with datum ticks, not a disc. */
function GoalZone({ at }: { at: [number, number] }) {
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * GOAL_R, 0, Math.sin(a) * GOAL_R));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const ticks = useMemo(() => {
    const pts: number[] = [];
    const t = GOAL_R * 0.34;
    pts.push(-GOAL_R - t, 0, 0, -GOAL_R + t, 0, 0);
    pts.push(GOAL_R - t, 0, 0, GOAL_R + t, 0, 0);
    pts.push(0, 0, -GOAL_R - t, 0, 0, -GOAL_R + t);
    pts.push(0, 0, GOAL_R - t, 0, 0, GOAL_R + t);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  return (
    <group position={[at[0], TABLE_Z + 0.0012, at[1]]}>
      <line>
        <primitive object={ring} attach="geometry" />
        <lineBasicMaterial color="#5A8FCC" />
      </line>
      <lineSegments geometry={ticks}>
        <lineBasicMaterial color="#5A8FCC" />
      </lineSegments>
    </group>
  );
}

function Payload({ pos }: { pos: React.RefObject<[number, number, number]> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.position.set(pos.current[0], pos.current[2] + PAYLOAD_H / 2, pos.current[1]);
    }
  });
  return (
    <mesh ref={ref} castShadow>
      <cylinderGeometry args={[PAYLOAD_R, PAYLOAD_R, PAYLOAD_H, 24]} />
      <meshStandardMaterial color="#C6CBC2" roughness={0.42} metalness={0.22} />
    </mesh>
  );
}

/** Live joint readouts pinned to the joints themselves, drawing style. */
function JointCallout({
  position,
  label,
  value,
}: {
  position: [number, number, number];
  label: string;
  value: string;
}) {
  return (
    <Html position={position} center={false} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className="flex translate-x-3 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap">
        <span className="h-px w-5 bg-brass/70" />
        <span className="font-mono text-[12px] leading-none text-brass">
          <span className="text-scribe-3">{label}</span> {value}
        </span>
      </div>
    </Html>
  );
}

function Rig({
  running,
  goal,
  start,
  onTelemetry,
  onSample,
}: ViewportProps) {
  const { camera } = useThree();

  const target = useRef<[number, number, number]>([...INITIAL_TARGET]);
  const grip = useRef<number>(GRIP_OPEN_MM);
  const object = useRef<[number, number, number]>([start[0], start[1], TABLE_Z]);
  const held = useRef(false);
  const keys = useRef<Record<string, boolean>>({});
  const acc = useRef(0);
  const elapsed = useRef(0);
  const joints = useRef(solve(INITIAL_TARGET));
  // The frame loop drives the ref; this mirrors it at the telemetry cadence so
  // the pinned callouts can render without reading a ref during render.
  const [jointsView, setJointsView] = useState(() => solve(INITIAL_TARGET));

  // Frame the whole workspace: the base, the full reach, the payload and the
  // goal all have to be readable without the operator moving the camera.
  useEffect(() => {
    camera.position.set(0.92, 0.74, 0.9);
    camera.lookAt(0.06, 0.12, 0.02);
  }, [camera]);

  useEffect(() => {
    object.current = [start[0], start[1], TABLE_Z];
    target.current = [...INITIAL_TARGET];
    grip.current = GRIP_OPEN_MM;
    held.current = false;
    elapsed.current = 0;
  }, [start]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "e", "d"].includes(k)
      ) {
        e.preventDefault();
      }
      if (k === " ") {
        grip.current = grip.current > GRIP_CLOSED ? 6 : GRIP_OPEN_MM;
        return;
      }
      keys.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    const step = dt * 0.42;
    const k = keys.current;
    const t = target.current;

    // Motion is in the camera's ground plane so "up" always means away.
    if (k["arrowup"]) t[0] += step;
    if (k["arrowdown"]) t[0] -= step;
    if (k["arrowleft"]) t[1] += step;
    if (k["arrowright"]) t[1] -= step;
    if (k["e"]) t[2] += step;
    if (k["d"]) t[2] -= step;

    t[2] = Math.max(TABLE_Z + 0.012, Math.min(0.46, t[2]));
    const radial = Math.hypot(t[0], t[1]);
    if (radial > REACH_MAX) {
      t[0] = (t[0] / radial) * REACH_MAX;
      t[1] = (t[1] / radial) * REACH_MAX;
    }

    const tool = toolPosition(joints.current);
    const o = object.current;

    // Grasp: the jaws have to be closed and the tool near the payload's waist.
    const near =
      Math.hypot(tool[0] - o[0], tool[1] - o[1], tool[2] - (o[2] + PAYLOAD_H / 2)) < CAPTURE_R;

    if (!held.current && grip.current <= GRIP_CLOSED && near) held.current = true;
    if (held.current && grip.current > GRIP_CLOSED) held.current = false;

    if (held.current) {
      o[0] = tool[0];
      o[1] = tool[1];
      o[2] = Math.max(TABLE_Z, tool[2] - PAYLOAD_H / 2);
    } else if (o[2] > TABLE_Z) {
      o[2] = Math.max(TABLE_Z, o[2] - 0.9 * dt);
    }

    if (running) elapsed.current += dt;

    const settled = !held.current && o[2] <= TABLE_Z + 1e-4;
    const deviationMm = Math.hypot(o[0] - goal[0], o[1] - goal[1]) * 1000;

    acc.current += dt;
    if (acc.current >= 1 / SAMPLE_HZ) {
      acc.current = 0;
      const j = joints.current;
      if (running) {
        onSample({
          t: Number(elapsed.current.toFixed(3)),
          q: [j.j1, j.j2, j.j3, 0, j.j5, 0],
          grip: grip.current,
          object: [o[0], o[1], o[2]],
        });
      }
      onTelemetry({
        joints: j,
        tool,
        object: [o[0], o[1], o[2]],
        grip: grip.current,
        held: held.current,
        settled,
        deviationMm,
      });
      setJointsView(j);
    }
  });

  const shoulderY = 0.192;

  return (
    <>
      <hemisphereLight args={["#7C91AB", "#0A1119", 0.42]} />
      <directionalLight
        position={[0.9, 1.25, 0.6]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.8}
        shadow-camera-right={0.8}
        shadow-camera-top={0.8}
        shadow-camera-bottom={-0.8}
      />
      <directionalLight position={[-0.8, 0.5, -0.7]} intensity={0.5} color="#5A8FCC" />

      <SurfacePlate />
      <GoalZone at={goal} />
      <Payload pos={object} />
      <Arm
        target={target}
        grip={grip}
        onJoints={(next) => {
          joints.current = next;
        }}
      />

      {/* Datum axis — the single vertical spine every reading is pinned to. */}
      <line>
        <primitive
          object={useMemo(
            () =>
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0.52, 0),
              ]),
            [],
          )}
          attach="geometry"
        />
        <lineBasicMaterial color="#3A5270" />
      </line>

      {running ? (
        <>
          <JointCallout
            position={[0, shoulderY, 0]}
            label="J2"
            value={`${((jointsView.j2 * 180) / Math.PI).toFixed(1)}°`}
          />
          <JointCallout
            position={[0, 0.06, 0]}
            label="J1"
            value={`${((jointsView.j1 * 180) / Math.PI).toFixed(1)}°`}
          />
        </>
      ) : null}
    </>
  );
}

export function StationViewport(props: ViewportProps) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 34, near: 0.02, far: 12 }}
      gl={{ antialias: true }}
      style={{ background: "#070D15" }}
    >
      <Rig {...props} />
    </Canvas>
  );
}
