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
/**
 * How close the tool has to be, in the table plane, to close on the payload.
 *
 * This used to be the radius of a sphere measured to the payload's waist, which
 * quietly made the grasp much tighter than it reads: the tool cannot descend
 * below 12 mm above the table, the waist sits at 37.5 mm, and that 25 mm of
 * unavoidable vertical error ate most of the budget, leaving under 49 mm in the
 * plane — with nothing on screen to say whether you were inside it or not.
 * The test is now a cylinder, so this is the whole plane tolerance.
 */
export const CAPTURE_R = 0.09;
export const GRIP_CLOSED = 12; // mm jaw opening below which a grasp forms
export const GRIP_OPEN_MM = 42;
const SAMPLE_HZ = 20;
/** Points kept in the ghost trail — about a minute at the sample rate. */
const TRAIL_MAX = 1200;
const trailCount = { current: 0 };

// Pointer drag is accumulated here rather than in component state: the rig
// remounts per run and lives inside the react-three-fiber reconciler, so the
// canvas DOM listeners and the frame loop need a mutable cell that outlives
// both. The frame loop drains it.
const drag = { current: [0, 0] as [number, number] };

// The camera is fixed, so the ground-plane basis it projects to is a constant.
// Dragging right walks the tool along the screen's right; dragging up pushes it
// away. Derived from the camera position and target set in the rig below.
const DRAG_RIGHT = [0.716, -0.699];
const DRAG_AWAY = [0.699, 0.715];
const DRAG_METRES_PER_PX = 0.0012;

/** Where the tool starts every run, in the arm's own frame. */
const INITIAL_TARGET: [number, number, number] = [0.3, 0, 0.16];

export type Telemetry = {
  joints: { j1: number; j2: number; j3: number; j5: number; clamped: boolean };
  tool: [number, number, number];
  object: [number, number, number];
  grip: number;
  held: boolean;
  /** The tool is inside the payload's capture volume — closing will grasp. */
  inRange: boolean;
  /** Over the payload in the plane, but above the height the jaws can close at. */
  overPayload: boolean;
  /** Distance from the tool to the payload in the table plane, metres. */
  payloadDist: number;
  settled: boolean;
  deviationMm: number;
};

type ViewportProps = {
  running: boolean;
  goal: [number, number];
  start: [number, number];
  /** The objects this task is actually about. The instruction names them; the
   *  scene used to render an anonymous cylinder regardless, which made every
   *  recorded trajectory a demonstration of moving a grey puck. */
  payloadUrl: string;
  payloadWidthMm: number;
  targetUrl: string;
  targetWidthMm: number;
  /** The room this task happens in, resolved from the scenario the contract
   *  stores. Absent renders the bare measuring surface, as it always did. */
  environmentUrl?: string;
  /** Incremented by the station on every new run. The rig is keyed on it, so a
   *  new run remounts the scene rather than trying to reset it in place. */
  runId: number;
  onTelemetry: (t: Telemetry) => void;
  onSample: (s: Sample) => void;
  /** Other operators working this same task, right now. Presence only: none of
   *  this is scored, and a run measures identically with the room empty. */
  ghosts?: { id: string; tool: [number, number, number]; held: boolean }[];
};

useGLTF.preload("/models/thenar-6.glb");

/**
 * A prop, scaled from the millimetres it was authored in into the workspace.
 *
 * Every prop is generated Z-up with its origin on the footprint centre, so it
 * needs the same -90 about X the arm gets, and a scale that makes its declared
 * width match the space the task gives it.
 */
function Prop({ url, widthMm, targetM, position, opacity = 1 }: {
  url: string; widthMm: number; targetM: number;
  position: [number, number, number]; opacity?: number;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (opacity < 1) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true;
        mat.opacity = opacity;
        m.material = mat;
      }
    });
    return c;
  }, [scene, opacity]);
  const k = (targetM * 1000) / widthMm / 1000;
  return (
    <primitive
      object={model}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[k, k, k]}
    />
  );
}

function Arm({
  target,
  grip,
  onJoints,
}: {
  target: React.RefObject<[number, number, number]>;
  grip: React.RefObject<number>;
  onJoints: (j: ReturnType<typeof solve>) => void;
}) {
  const { scene } = useGLTF("/models/thenar-6.glb");

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

/**
 * The room, under the measuring surface.
 *
 * The scenario has been a uint8 on the contract since the first deployment and
 * it changed a word in the sidebar and nothing else — a workshop task and a
 * kitchen task were recorded against the same bare grey table. The room is
 * built from named dimensions with its work surface top at z = 0, so it drops
 * straight in under the plate.
 *
 * It sits a hair below the plate rather than at it: two coplanar surfaces
 * z-fight, and the artefact reads as a flickering table.
 */
function Room({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.receiveShadow = true;
        m.castShadow = false;   // the room is the ground, not a caster
      }
    });
  }, [model]);

  return (
    <primitive
      object={model}
      // Millimetres to metres, and the CAD frame is Z-up like the arm's.
      scale={0.001}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.0025, 0]}
    />
  );
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
        <meshStandardMaterial color="#141414" roughness={0.84} metalness={0.06} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#3D3D3D" transparent opacity={0.5} />
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
    <group position={[at[0], TABLE_Z + 0.0012, -at[1]]}>
      <line>
        <primitive object={ring} attach="geometry" />
        <lineBasicMaterial color="#FF6A00" />
      </line>
      <lineSegments geometry={ticks}>
        <lineBasicMaterial color="#FF6A00" />
      </lineSegments>
    </group>
  );
}

function Payload({ pos, url, widthMm }: { pos: React.RefObject<[number, number, number]>; url: string; widthMm: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      // Same sign convention as the goal ring: the arm model is rotated -90
      // about X, so a plane-Y becomes three's -Z.
      ref.current.position.set(pos.current[0], pos.current[2] + PAYLOAD_H / 2, -pos.current[1]);
    }
  });
  return (
    <group ref={ref}>
      <Prop url={url} widthMm={widthMm} targetM={PAYLOAD_R * 2}
            position={[0, -PAYLOAD_H / 2, 0]} />
    </group>
  );
}

/**
 * The path the payload has travelled, drawn behind it.
 *
 * The smoothness term scores the jerk of exactly this line, so showing it is
 * the difference between "you lost 40% on smoothness" and seeing why.
 */
function GhostTrail({ points }: { points: React.RefObject<Float32Array> }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  useFrame(() => {
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    attr.array.set(points.current);
    attr.needsUpdate = true;
    geom.setDrawRange(0, trailCount.current);
    geom.computeBoundingSphere();
  });

  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color="#FF6A00" transparent opacity={0.55} />
    </line>
  );
}

/** How far the tool can reach, drawn only when the operator hits the limit. */
function ReachEnvelope({ visible }: { visible: boolean }) {
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * REACH_MAX, 0, Math.sin(a) * REACH_MAX));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  if (!visible) return null;
  return (
    <group position={[0, TABLE_Z + 0.002, 0]}>
      <line>
        <primitive object={ring} attach="geometry" />
        <lineBasicMaterial color="#FF2D55" transparent opacity={0.75} />
      </line>
    </group>
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
        <span className="h-px w-5 bg-signal/80" />
        <span className="font-mono text-[12px] leading-none text-signal">
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
  payloadUrl,
  payloadWidthMm,
  targetUrl,
  targetWidthMm,
  environmentUrl,
  onTelemetry,
  onSample,
}: Omit<ViewportProps, "runId">) {
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
  const trail = useRef(new Float32Array(TRAIL_MAX * 3));
  // The rig remounts per run, so the trail starts empty with it.
  useState(() => { trailCount.current = 0; });
  const [outOfReach, setOutOfReach] = useState(false);

  // Frame the whole workspace: the base, the full reach, the payload and the
  // goal all have to be readable without the operator moving the camera.
  useEffect(() => {
    camera.position.set(0.92, 0.74, 0.9);
    camera.lookAt(0.06, 0.12, 0.02);
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "q", "e"].includes(k)
      ) {
        // Also stops space activating whatever button still has focus — after
        // "Begin run" that is the End run button, so a press to close the jaws
        // was ending the run instead.
        e.preventDefault();
      }
      if (k === " ") {
        // Held keys auto-repeat. A toggle on every repeat flips the jaws open
        // and shut many times a second and leaves them wherever the last event
        // landed, which is why closing them appeared to do nothing at all.
        if (e.repeat) return;
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
    // WASD and the arrows are the same control. Reaching for one and getting
    // nothing is the most common way an operator concludes the rig is broken.
    if (k["arrowup"] || k["w"]) t[0] += step;
    if (k["arrowdown"] || k["s"]) t[0] -= step;
    if (k["arrowleft"] || k["a"]) t[1] += step;
    if (k["arrowright"] || k["d"]) t[1] -= step;
    if (k["e"]) t[2] += step;
    if (k["q"]) t[2] -= step;

    // Drain whatever the pointer accumulated since the last frame.
    const [dx, dy] = drag.current;
    if (dx !== 0 || dy !== 0) {
      t[0] += DRAG_RIGHT[0] * dx + DRAG_AWAY[0] * dy;
      t[1] += DRAG_RIGHT[1] * dx + DRAG_AWAY[1] * dy;
      drag.current = [0, 0];
    }

    t[2] = Math.max(TABLE_Z + 0.012, Math.min(0.46, t[2]));
    const radial = Math.hypot(t[0], t[1]);
    if (radial > REACH_MAX) {
      t[0] = (t[0] / radial) * REACH_MAX;
      t[1] = (t[1] / radial) * REACH_MAX;
    }

    const tool = toolPosition(joints.current);
    const o = object.current;

    // Grasp: the jaws have to be closed and the tool inside the payload's own
    // cylinder — within CAPTURE_R in the table plane, and somewhere along its
    // height rather than at one exact point on it.
    const planar = Math.hypot(tool[0] - o[0], tool[1] - o[1]);
    // The tool starts at z 0.16 and the payload's top is at 0.075, so the band
    // reaches up far enough that one press of Q from the rest pose puts the
    // jaws on it. Tighter than this and the operator is over the payload,
    // pressing space, and nothing happens for no visible reason.
    const withinHeight = tool[2] > o[2] - 0.02 && tool[2] < o[2] + PAYLOAD_H + 0.055;
    const overIt = planar < CAPTURE_R;
    const near = overIt && withinHeight;

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

      // The trail follows the payload, which is what the score measures.
      if (running && trailCount.current < TRAIL_MAX) {
        const k = trailCount.current * 3;
        trail.current[k] = o[0];
        trail.current[k + 1] = o[2] + PAYLOAD_H / 2;
        trail.current[k + 2] = -o[1];
        trailCount.current += 1;
      }
      const j = joints.current;
      if (running) {
        onSample({
          t: Number(elapsed.current.toFixed(3)),
          q: [j.j1, j.j2, j.j3, 0, j.j5, 0],
          grip: grip.current,
          object: [o[0], o[1], o[2]],
        });
      }
      setOutOfReach(j.clamped);
      onTelemetry({
        joints: j,
        tool,
        object: [o[0], o[1], o[2]],
        grip: grip.current,
        held: held.current,
        inRange: near,
        // Over the payload but too high to close on it — the operator needs to
        // be told to descend, not left guessing why space does nothing.
        overPayload: overIt && !withinHeight,
        payloadDist: planar,
        settled,
        deviationMm,
      });
      setJointsView(j);
    }
  });

  const shoulderY = 0.192;

  return (
    <>
      <hemisphereLight args={["#8F8F8F", "#000000", 0.4]} />
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
      <directionalLight position={[-0.8, 0.5, -0.7]} intensity={0.45} color="#FF9A3D" />

      {environmentUrl ? <Room url={environmentUrl} /> : null}
      <SurfacePlate />
      <ReachEnvelope visible={outOfReach} />
      <GhostTrail points={trail} />
      <GoalZone at={goal} />
      {/* The landmark the instruction names, sitting at the datum it defines. */}
      <Prop url={targetUrl} widthMm={targetWidthMm} targetM={GOAL_R * 1.7}
            position={[goal[0], TABLE_Z, -goal[1]]} opacity={0.92} />
      <Payload pos={object} url={payloadUrl} widthMm={payloadWidthMm} />
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
        <lineBasicMaterial color="#3D3D3D" />
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

/**
 * Everyone else's tool, in the same scene.
 *
 * Drawn as an open marker rather than a second arm: a room of six full
 * manipulators is unreadable, and the thing an operator actually wants to know
 * is where the other hands are and whether they are carrying anything. Scene
 * coordinates are (x, z, -y) from the robot frame, the same mapping the payload
 * uses — getting this wrong puts the room in a mirror of the room.
 */
function Ghosts({ ghosts }: { ghosts: { id: string; tool: [number, number, number]; held: boolean }[] }) {
  return (
    <group>
      {ghosts.map((g) => (
        <group key={g.id} position={[g.tool[0], g.tool[2], -g.tool[1]]}>
          <mesh>
            <sphereGeometry args={[0.018, 16, 12]} />
            <meshBasicMaterial
              color={g.held ? "#e8b23a" : "#5a7d8c"}
              transparent
              opacity={0.55}
              depthWrite={false}
            />
          </mesh>
          {/* A dropped line to the table, so a ghost reads as a position in the
              workspace rather than a dot floating in front of the camera. */}
          <mesh position={[0, -g.tool[2] / 2, 0]}>
            <cylinderGeometry args={[0.0012, 0.0012, Math.max(g.tool[2], 0.001), 6]} />
            <meshBasicMaterial color="#5a7d8c" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function StationViewport(props: ViewportProps) {
  // Fetch the task's props as soon as the task is known, rather than on the
  // first rendered frame. The arm has always done this through a module-scope
  // preload; without the same for the payload and the landmark, the scene pops
  // in a beat late — and in a tab that is not compositing, not at all.
  useEffect(() => {
    for (const url of [props.payloadUrl, props.targetUrl, props.environmentUrl]) {
      if (url) useGLTF.preload(url);
    }
  }, [props.payloadUrl, props.targetUrl, props.environmentUrl]);

  const [lost, setLost] = useState(false);
  // Everything except presence goes to Rig: it must not re-render six times a
  // second just because somebody else moved.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ghosts: _presence, ...rigProps } = props;

  // A lost context leaves a black rectangle and no error anyone can see. Catch
  // it, tell the operator, and let the browser hand the context back.
  const onCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setLost(true); });
    canvas.addEventListener("webglcontextrestored", () => setLost(false));

    // Dragging the workspace is the first thing anyone tries in a 3D viewport.
    // It drives the same target the keys do, in the plane the camera shows.
    let dragging = false;
    let last: [number, number] = [0, 0];
    const begin = (e: PointerEvent) => {
      dragging = true;
      last = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      drag.current = [
        drag.current[0] + (e.clientX - last[0]) * DRAG_METRES_PER_PX,
        drag.current[1] - (e.clientY - last[1]) * DRAG_METRES_PER_PX,
      ];
      last = [e.clientX, e.clientY];
    };
    const end = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = "grab";
    };
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", begin);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  };

  return (
    <>
      {lost ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-0/92 px-6">
          <div className="max-w-sm text-center">
            <p className="font-display text-xl font-600 text-reject">The 3D context was lost</p>
            <p className="mt-2 text-[14px] leading-relaxed text-scribe-2">
              The browser took the graphics context back, usually under memory
              pressure. Nothing recorded so far is affected. Reload the page to
              carry on.
            </p>
            <button
              onClick={() => location.reload()}
              className="mt-5 border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0"
            >
              Reload
            </button>
          </div>
        </div>
      ) : null}
    <Canvas
      onCreated={onCreated}
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 34, near: 0.02, far: 12 }}
      gl={{ antialias: true }}
      style={{ background: "#000000" }}
    >
      {/* Ghosts tick six times a second; Rig must not re-render with them,
          or the whole scene reconciles on every presence update. */}
      <Rig key={props.runId} {...rigProps} />
      <Ghosts ghosts={props.ghosts ?? []} />
    </Canvas>
    </>
  );
}
