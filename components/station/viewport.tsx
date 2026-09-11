"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { sceneColor } from "@/lib/theme-color";
import { Html, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EnterXR, XRControls } from "@/components/station/xr";
import { click } from "@/lib/click";
import { act as policyAct } from "@/lib/policy";
import { REACH_MAX, solve, solveAt, toolPositionAt } from "@/lib/kinematics";
import type { Sample } from "@/lib/types";
import { GOAL_R, TOLERANCE_M, SEAT_OFFSET, seatFor } from "@/lib/bench";

/* Scene constants, metres.

   The goal radius and the placement band are not here: the scorer needs them
   too and cannot import a three.js module, so they live in lib/bench.ts and
   are re-exported from here for everything that already reads them off the
   viewport. One datum, one definition, two readers. */
export { GOAL, GOAL_R, TOLERANCE_M, SEAT_OFFSET, seatFor } from "@/lib/bench";
export const TABLE_Z = 0.0;
export const TABLE_HALF = 0.42;
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
/**
 * Where a second arm stands, when a scene has one.
 *
 * Far enough that the two envelopes overlap only across the middle of the
 * bench — which is the whole point of a two-arm scene, a region both can reach
 * and a region only one can — and close enough that both bases and the datum
 * are in the camera's frame at once.
 */
export const ARM_B_BASE: [number, number] = [0.34, 0.02];

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
  /** Every payload in the scene, in the order the instruction named them. */
  objects: [number, number, number][];
  /** Which one the jaws are on, or null. */
  activeIndex: number | null;
  /** Which have come to rest inside their own seat's tolerance. */
  placed: boolean[];
  /** True once a later payload has been left placed while an earlier one has
   *  not been — the operator is doing the task out of the order it was written. */
  outOfOrder: boolean;
  /** How many arms the scene has, and which one the controls are driving. */
  arms: number;
  activeArm: number;
};

type ViewportProps = {
  running: boolean;
  goal: readonly [number, number];
  start: [number, number];
  /** The objects this task is actually about. The instruction names them; the
   *  scene used to render an anonymous cylinder regardless, which made every
   *  recorded trajectory a demonstration of moving a grey puck. */
  payloads: { url: string; widthMm: number }[];
  /** Two arms, when the task needs two. A scene with one is untouched: the
   *  single arm keeps the origin, its solver and its recorded columns. */
  arms?: 1 | 2;
  targetUrl: string;
  targetWidthMm: number;
  /** The room this task happens in, resolved from the scenario the contract
   *  stores. Absent renders the bare measuring surface, as it always did. */
  environmentUrl?: string;
  /** How that room is lit. Absent falls back to the neutral bench. */
  lighting?: import("@/lib/environments").RoomLight;
  /**
   * Hand the controls to the trained policy.
   *
   * It drives the same target the keys and the pointer drive, through the same
   * kinematics and the same grasp rule — anything else would be a different
   * machine wearing this one's viewport, and what it did would say nothing
   * about what an operator's recording is worth.
   */
  policy?: import("@/lib/policy").Policy | null;
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
  // cad/kernel.py applies MM = 0.001 once at export, so every GLB in this
  // project is already in metres — a 42 mm dice is 0.042 units across. Dividing
  // by 1000 again scaled it to 56 micrometres, which is why the scene showed the
  // arm and nothing else: the props were being drawn, a thousand times too small
  // to see. widthMm / 1000 is the model's real width; k takes it to targetM.
  const k = targetM / (widthMm / 1000);
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
  held,
  onJoints,
  base = [0, 0],
  dim = false,
}: {
  target: React.RefObject<[number, number, number]>;
  grip: React.RefObject<number>;
  /** Whether the jaws currently have the payload. */
  held?: React.RefObject<boolean>;
  onJoints: (j: ReturnType<typeof solve>) => void;
  /** Where this arm is bolted to the bench, in the table plane. Every arm here
   *  is the same THENAR-6, so a second one is a change of frame and nothing
   *  else — the solver, the link lengths and the reach are shared. */
  base?: [number, number];
  /** Drawn back when this is not the arm the controls are driving, so the
   *  operator can see which one will move before they move it. */
  dim?: boolean;
}) {
  const wasHolding = useRef(false);
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

  useFrame((state) => {
    // A still arm reads as a broken one. When nothing is being driven the wrist
    // carries a very small, slow drift — the amount a real servo holding
    // position actually moves, not an animation.
    const idleT = state.clock.elapsedTime;
    const idle = held?.current ? 0 : Math.sin(idleT * 0.7) * 0.004;

    // Solved in this arm's own frame. `target` is in world coordinates, which
    // is what the payload and the datum are in.
    const j = solveAt(base, target.current);
    const n = nodes.current;
    if (n.j1) n.j1.rotation.z = j.j1;
    if (n.j2) n.j2.rotation.y = j.j2;
    if (n.j3) n.j3.rotation.y = j.j3;
    if (n.j5) n.j5.rotation.y = j.j5 + idle;

    const half = grip.current / 2000; // mm -> m, per jaw
    if (n.jawL) n.jawL.position.x = -half;
    if (n.jawR) n.jawR.position.x = half;

    // The moment of capture is the one event in a run with no feedback at all:
    // the payload starts moving with the tool and nothing says why. The jaws
    // take the signal colour while they are actually holding something.
    const holding = held?.current === true;
    if (holding !== wasHolding.current) {
      wasHolding.current = holding;
      // The same transition the jaws colour on, so what is heard and what is
      // seen cannot disagree.
      click(holding ? "grasp" : "release");
      for (const jaw of [n.jawL, n.jawR]) {
        jaw?.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!m || !("emissive" in m)) return;
          m.emissive?.set(holding ? sceneColor.signal() : "#000000");
          m.emissiveIntensity = holding ? 0.55 : 0;
        });
      }
    }

    onJoints(j);
  });

  // The CAD frame is Z-up, as URDF is; three.js is Y-up. The base offset is a
  // plane translation, and the plane's Y is three's -Z.
  return (
    <group position={[base[0], 0, -base[1]]}>
      <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />
      {/* Which arm the controls are on, said in the scene rather than only in
          the panel: a ring on the bench under the arm that is live. */}
      {!dim ? <ActiveRing /> : null}
    </group>
  );
}

/** A mark under the arm the controls are currently driving. */
function ActiveRing() {
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  // Wrapped in a group rather than positioning the line itself: `position` on
  // a bare <line> resolves to the SVG element's attributes, not three's.
  return (
    <group position={[0, TABLE_Z + 0.0015, 0]}>
      <line>
        <primitive object={ring} attach="geometry" />
        <lineBasicMaterial color={sceneColor.signal()} transparent opacity={0.7} />
      </line>
    </group>
  );
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
      // Already in metres, like every other model here — the export does the
      // conversion. The CAD frame is Z-up, as the arm's is.
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
        <lineBasicMaterial color={sceneColor.ruleStrong()} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

/**
 * The goal drawn as a tolerance zone: a circle with datum ticks, not a disc.
 *
 * A second ring reads the payload's distance from the centre. It is not
 * decoration — it is the placement term, which is 55% of the score, shown while
 * there is still time to act on it. Inside tolerance it closes on the payload
 * and turns green; outside it sits on the tolerance band in red. The operator
 * used to learn this only after letting go.
 */
function GoalZone({ at, payload, seats = 1 }: {
  at: readonly [number, number];
  payload?: React.RefObject<[number, number, number]>;
  /** How many payloads have to come to rest here. Two seats are drawn as two
   *  small marks inside the ring, so the operator can see that the datum is
   *  asking for two placements before finding out at the end. */
  seats?: number;
}) {
  const live = useRef<THREE.Group>(null);
  const mat = useRef<THREE.LineBasicMaterial>(null);

  useFrame(() => {
    const g = live.current, m = mat.current, p = payload?.current;
    if (!g || !m || !p) return;
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    const tol = TOLERANCE_M;
    // Clamped so the ring stays visible when the payload is far away.
    const r = Math.min(Math.max(d, 0.004), GOAL_R * 1.6);
    g.scale.setScalar(r / GOAL_R);
    g.visible = d < GOAL_R * 2.2;
    m.color.set(d <= tol ? sceneColor.go() : sceneColor.reject());
    m.opacity = d <= tol ? 0.95 : 0.5;
  });

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

  const seatMarks = useMemo(() => {
    if (seats < 2) return null;
    const pts: number[] = [];
    for (let i = 0; i < seats; i += 1) {
      const cx = i === 0 ? -SEAT_OFFSET : SEAT_OFFSET;
      for (let k = 0; k <= 48; k += 1) {
        const a = (k / 48) * Math.PI * 2;
        const r = TOLERANCE_M;
        if (k > 0) pts.push(cx + Math.cos(((k - 1) / 48) * Math.PI * 2) * r, 0, Math.sin(((k - 1) / 48) * Math.PI * 2) * r);
        pts.push(cx + Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [seats]);

  return (
    <group position={[at[0], TABLE_Z + 0.0012, -at[1]]}>
      {seatMarks ? (
        <lineSegments>
          <primitive object={seatMarks} attach="geometry" />
          <lineBasicMaterial color="#8A9BA5" transparent opacity={0.55} />
        </lineSegments>
      ) : null}
      <line>
        <primitive object={ring} attach="geometry" />
        <lineBasicMaterial color={sceneColor.signal()} />
      </line>
      <lineSegments geometry={ticks}>
        <lineBasicMaterial color={sceneColor.signal()} />
      </lineSegments>
      {payload ? (
        <group ref={live}>
          <line>
            <primitive object={ring} attach="geometry" />
            <lineBasicMaterial ref={mat} color={sceneColor.go()} transparent opacity={0.9} />
          </line>
        </group>
      ) : null}
    </group>
  );
}

function Payload({ index, all, url, widthMm }: {
  index: number;
  all: React.RefObject<[number, number, number][]>;
  url: string;
  widthMm: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const pos = all.current?.[index];
    if (ref.current && pos) {
      // Same sign convention as the goal ring: the arm model is rotated -90
      // about X, so a plane-Y becomes three's -Z.
      ref.current.position.set(pos[0], pos[2] + PAYLOAD_H / 2, -pos[1]);
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
    // Per-vertex colour, so the line can fade along its own length. A uniform
    // trail says where the payload has been; a fading one says where it just
    // was, which is the part worth reading while driving.
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  useFrame(() => {
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    attr.array.set(points.current);
    attr.needsUpdate = true;

    // Age the line: the newest quarter is full signal, everything behind it
    // falls away toward the table. Written only over the range actually drawn.
    const col = geom.getAttribute("color") as THREE.BufferAttribute;
    const n = trailCount.current;
    const c = col.array as Float32Array;
    // The accent, read from the stylesheet rather than written out as float
    // components. These three numbers were 1.0/0.416/0.0 — the discarded brand
    // orange, hardcoded past the point where any search for "#FF6A00" would
    // find it, on the one line in the scene the smoothness term actually scores.
    const trail = new THREE.Color(sceneColor.signal());
    for (let i = 0; i < n; i += 1) {
      const age = n > 1 ? i / (n - 1) : 1;       // 0 oldest, 1 newest
      const k = Math.max(0.06, Math.pow(age, 2.2));
      c[i * 3] = trail.r * k;
      c[i * 3 + 1] = trail.g * k;
      c[i * 3 + 2] = trail.b * k;
    }
    col.needsUpdate = true;

    geom.setDrawRange(0, n);
    geom.computeBoundingSphere();
  });

  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial vertexColors transparent opacity={0.9} />
    </line>
  );
}

/** How far the tool can reach, drawn only when the operator hits the limit. */
/**
 * The edge of what the arm can reach.
 *
 * A ring appearing said "something is wrong" and left the operator to work out
 * what. It now marks the bearing the tool is actually pushing against, so the
 * limit reads as a direction to come back from rather than a general alarm.
 */
function ReachEnvelope({ visible, target }: {
  visible: boolean;
  target?: React.RefObject<[number, number, number]>;
}) {
  const spur = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = spur.current, t = target?.current;
    if (!g || !t) return;
    // Point the marker along the bearing of the requested position, which is
    // the direction the operator is asking the arm to go.
    g.rotation.y = -Math.atan2(-t[1], t[0]);
  });

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
        <lineBasicMaterial color={sceneColor.reject()} transparent opacity={0.4} />
      </line>
      {/* A brighter spur on the bearing being pushed against. */}
      <group ref={spur}>
        <mesh position={[REACH_MAX, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[REACH_MAX * 0.045, REACH_MAX * 0.075, 24]} />
          <meshBasicMaterial color={sceneColor.reject()} transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
      </group>
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
  payloads,
  arms = 1,
  targetUrl,
  targetWidthMm,
  environmentUrl,
  lighting,
  onTelemetry,
  onSample,
  policy,
}: Omit<ViewportProps, "runId">) {
  const { camera } = useThree();

  const target = useRef<[number, number, number]>([...INITIAL_TARGET]);
  const grip = useRef<number>(GRIP_OPEN_MM);

  /**
   * The second arm, when the task has one.
   *
   * Held in its own refs rather than an array, so the single-arm path reads
   * exactly as it did: one target, one grip, one solve. The controls drive
   * whichever arm is active, and only one is active at a time — a scene where
   * both move at once needs two operators, and a run recorded by one person
   * pretending otherwise would not be a recording of the task.
   */
  const [initialB] = useState<[number, number, number]>(() => [
    ARM_B_BASE[0] + INITIAL_TARGET[0] * 0.5,
    ARM_B_BASE[1] + INITIAL_TARGET[1],
    INITIAL_TARGET[2],
  ]);
  const targetB = useRef<[number, number, number]>(initialB);
  const gripB = useRef<number>(GRIP_OPEN_MM);
  const heldB = useRef(false);
  const holdsB = useRef<number | null>(null);
  const jointsB = useRef(solveAt(ARM_B_BASE, initialB));
  /** 0 is the arm at the origin. Switched with Tab. */
  const activeArm = useRef(0);
  const [activeArmView, setActiveArmView] = useState(0);
  /**
   * Every payload in the scene, at rest on the table.
   *
   * A one-object scene keeps the exact start position it always had, so its
   * trajectories are comparable with every run recorded before scenes could
   * carry two. A two-object scene spreads them far enough apart that "the
   * nearest one" is never a coin toss.
   */
  const [startPoses] = useState<[number, number, number][]>(() =>
    payloads.length < 2
      ? [[start[0], start[1], TABLE_Z]]
      : [
          [start[0] - 0.03, start[1] + 0.03, TABLE_Z],
          [start[0] + 0.06, start[1] - 0.05, TABLE_Z],
        ],
  );
  const objects = useRef<[number, number, number][]>(startPoses);
  /** Kept so everything downstream that only ever cared about one payload —
   *  the trail, the closing datum ring — keeps reading the one being driven. */
  const object = useRef<[number, number, number]>(startPoses[0]);
  const activeIndex = useRef<number | null>(null);
  const outOfOrderRef = useRef(false);
  const held = useRef(false);
  /**
   * Which payloads the operator has actually picked up.
   *
   * A run ends when the scene settles, and a payload nobody has touched is
   * sitting still at its start — so on a two-object bench the run ended the
   * moment the first object was let go, scored the second where it had always
   * been, and reported the whole thing out of tolerance. "Put the spoon and the
   * mug into the crate" could not be completed at all: place the spoon, and
   * seven hundred milliseconds later the measurement was taken with the mug
   * untouched, 282 mm from its seat.
   *
   * The rule this restores is the one the code beside it already claimed —
   * a scene is placed when all of it is. A one-object scene is unchanged,
   * because the station already required that its single payload had been held.
   */
  const touched = useRef<boolean[]>([]);
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
      // Tab switches which arm the controls drive, and only where there are
      // two — otherwise it stays the browser's focus key, which the keyboard
      // path this station already supports depends on.
      if (k === "tab" && arms > 1) {
        e.preventDefault();
        if (e.repeat) return;
        activeArm.current = activeArm.current === 0 ? 1 : 0;
        setActiveArmView(activeArm.current);
        return;
      }

      if (k === " ") {
        // Held keys auto-repeat. A toggle on every repeat flips the jaws open
        // and shut many times a second and leaves them wherever the last event
        // landed, which is why closing them appeared to do nothing at all.
        if (e.repeat) return;
        const g = activeArm.current === 0 ? grip : gripB;
        g.current = g.current > GRIP_CLOSED ? 6 : GRIP_OPEN_MM;
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
    // `arms` decides whether Tab is ours or the browser's focus key, so the
    // listener has to be rebound if a scene ever changes shape under it.
  }, [arms]);

  useFrame((_, dt) => {
    const step = dt * 0.42;
    const k = keys.current;
    // The controls drive one arm at a time. Only one is active because a scene
    // where both move at once needs two operators, and a run recorded by one
    // person pretending otherwise would not be a recording of the task.
    const A = activeArm.current;
    const t = A === 0 ? target.current : targetB.current;
    const activeBase: [number, number] = A === 0 ? [0, 0] : ARM_B_BASE;

    // The policy drives the same target the keys do, and only while it is
    // handed the controls. Its action is a tool delta, so it is applied where
    // a key press would be rather than by moving the arm directly.
    if (policy && running) {
      const now = toolPositionAt(activeBase, A === 0 ? joints.current : jointsB.current);
      const o0 = objects.current[0];
      const a = policyAct(policy, now, o0, goal, grip.current);
      t[0] += a.delta[0]; t[1] += a.delta[1]; t[2] += a.delta[2];
      grip.current = a.close ? 6 : GRIP_OPEN_MM;
    }

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
    // Reach is measured from this arm's own base, not from the origin. A
    // second arm clamped against the first one's axis would be unable to reach
    // its own bench.
    const radial = Math.hypot(t[0] - activeBase[0], t[1] - activeBase[1]);
    if (radial > REACH_MAX) {
      t[0] = activeBase[0] + ((t[0] - activeBase[0]) / radial) * REACH_MAX;
      t[1] = activeBase[1] + ((t[1] - activeBase[1]) / radial) * REACH_MAX;
    }

    // Each arm reads its own tool, holds its own payload and closes its own
    // jaws. Written as a loop rather than twice, so the second arm cannot
    // quietly drift from the first in behaviour the recording would then carry.
    const list = objects.current;
    const rigs = [
      { i: 0, base: [0, 0] as [number, number], joints: joints.current, grip, held, holds: activeIndex },
      { i: 1, base: ARM_B_BASE, joints: jointsB.current, grip: gripB, held: heldB, holds: holdsB },
    ].slice(0, arms);

    let planar = Infinity;
    let overIt = false;
    let withinHeight = false;
    let activeTool: [number, number, number] = toolPositionAt(activeBase, A === 0 ? joints.current : jointsB.current);
    let activeObject: [number, number, number] = list[0];

    for (const rig of rigs) {
      const tool = toolPositionAt(rig.base, rig.joints);

      // Which payload these jaws are addressing. While holding one it stays
      // that one; otherwise it is whichever is nearest in the table plane, and
      // never one the other arm already has.
      let nearest = -1;
      if (rig.held.current && rig.holds.current !== null) {
        nearest = rig.holds.current;
      } else {
        let best = Infinity;
        for (let j = 0; j < list.length; j += 1) {
          if (rigs.some((r) => r !== rig && r.held.current && r.holds.current === j)) continue;
          const d = Math.hypot(tool[0] - list[j][0], tool[1] - list[j][1]);
          if (d < best) { best = d; nearest = j; }
        }
      }
      if (nearest < 0) continue;
      const o = list[nearest];

      // Grasp: the jaws have to be closed and the tool inside the payload's own
      // cylinder — within CAPTURE_R in the table plane, and somewhere along its
      // height rather than at one exact point on it.
      const d = Math.hypot(tool[0] - o[0], tool[1] - o[1]);
      // The tool starts at z 0.16 and the payload's top is at 0.075, so the band
      // reaches up far enough that one press of Q from the rest pose puts the
      // jaws on it. Tighter than this and the operator is over the payload,
      // pressing space, and nothing happens for no visible reason.
      const inHeight = tool[2] > o[2] - 0.02 && tool[2] < o[2] + PAYLOAD_H + 0.055;
      const over = d < CAPTURE_R;

      if (!rig.held.current && rig.grip.current <= GRIP_CLOSED && over && inHeight) {
        rig.held.current = true;
        rig.holds.current = nearest;
        touched.current[nearest] = true;
      }
      if (rig.held.current && rig.grip.current > GRIP_CLOSED) {
        rig.held.current = false;
        rig.holds.current = null;
      }

      if (rig.held.current) {
        o[0] = tool[0];
        o[1] = tool[1];
        o[2] = Math.max(TABLE_Z, tool[2] - PAYLOAD_H / 2);
      }

      // The readouts follow the arm the operator is driving.
      if (rig.i === A) {
        object.current = o;
        activeTool = tool;
        activeObject = o;
        planar = d;
        overIt = over;
        withinHeight = inHeight;
      }
    }
    const near = overIt && withinHeight;
    const tool = activeTool;
    const o = activeObject;

    // Everything in nobody's jaws falls to the table, not just the active one:
    // a payload released mid-air while the operator moves to the other would
    // otherwise hang there.
    for (let i = 0; i < list.length; i += 1) {
      if (rigs.some((r) => r.held.current && r.holds.current === i)) continue;
      if (list[i][2] > TABLE_Z) list[i][2] = Math.max(TABLE_Z, list[i][2] - 0.9 * dt);
    }

    if (running) elapsed.current += dt;

    // Each payload is measured against its own seat. With one payload the seat
    // is the datum, so this is the same number it has always been.
    const devs = list.map((p, i) => {
      const seat = seatFor(goal, i, list.length);
      return Math.hypot(p[0] - seat[0], p[1] - seat[1]) * 1000;
    });
    // A payload in anybody's jaws is not at rest — including the second arm's,
    // which this used to miss because it only knew about the first one's hold.
    const inJaws = (i: number) => rigs.some((r) => r.held.current && r.holds.current === i);
    const atRest = list.map((p, i) => !inJaws(i) && p[2] <= TABLE_Z + 1e-4);
    const placed = devs.map((d, i) => atRest[i] && d <= TOLERANCE_M * 1000);

    // Every payload has to be down before the run can be measured, and the
    // score is set by the worst of them: a scene is placed when all of it is.
    // Down is not enough on its own — a payload nobody has lifted has been down
    // the whole time — so the operator has to have had each of them in the jaws
    // at least once. Ending early is still available, and still deliberate:
    // that is what the End run button is.
    const handled = list.every((_, i) => touched.current[i]);
    const settled = handled && atRest.every(Boolean) && !rigs.some((r) => r.held.current);
    const deviationMm = Math.max(...devs);

    // Placing a later payload while an earlier one is still in hand or still
    // out at its start is doing the task backwards. It is recorded rather than
    // blocked — the operator may be correcting — and it is derivable from the
    // samples alone, which is what lets the verifier charge for it too.
    if (list.length > 1 && placed[1] && !placed[0]) outOfOrderRef.current = true;

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
          // Always the first payload, never "the one being held": a recording
          // whose object column swaps identity halfway through is not a
          // trajectory of anything.
          object: [list[0][0], list[0][1], list[0][2]],
          ...(list.length > 1
            ? { object2: [list[1][0], list[1][1], list[1][2]] as [number, number, number] }
            : {}),
          // The second arm's pose, recorded whether or not it is the one being
          // driven. An arm that was in the room and holding something is part
          // of what happened, and a recording that omits it is a recording of
          // a different scene.
          ...(arms > 1
            ? {
                q2: [jointsB.current.j1, jointsB.current.j2, jointsB.current.j3, 0, jointsB.current.j5, 0] as
                  [number, number, number, number, number, number],
                grip2: gripB.current,
              }
            : {}),
        });
      }
      setOutOfReach(j.clamped);
      onTelemetry({
        joints: j,
        tool,
        object: [o[0], o[1], o[2]],
        grip: A === 0 ? grip.current : gripB.current,
        held: A === 0 ? held.current : heldB.current,
        inRange: near,
        // Over the payload but too high to close on it — the operator needs to
        // be told to descend, not left guessing why space does nothing.
        overPayload: overIt && !withinHeight,
        payloadDist: planar,
        settled,
        deviationMm,
        objects: list.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
        activeIndex: activeIndex.current,
        placed,
        outOfOrder: outOfOrderRef.current,
        arms,
        activeArm: A,
      });
      setJointsView(j);
    }
  });

  const shoulderY = 0.192;

  return (
    <>
      <hemisphereLight args={[
        lighting?.hemi.sky ?? "#8F8F8F",
        lighting?.hemi.ground ?? "#000000",
        lighting?.hemi.intensity ?? 0.4,
      ]} />
      <directionalLight
        position={[0.9, 1.25, 0.6]}
        color={lighting?.key.color ?? "#FFFFFF"}
        intensity={lighting?.key.intensity ?? 2.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.8}
        shadow-camera-right={0.8}
        shadow-camera-top={0.8}
        shadow-camera-bottom={-0.8}
      />
      <directionalLight
        position={[-0.8, 0.5, -0.7]}
        color={lighting?.fill.color ?? "#FFB877"}
        intensity={lighting?.fill.intensity ?? 0.45}
      />

      {environmentUrl ? <Room url={environmentUrl} /> : null}
      <SurfacePlate />
      <ReachEnvelope visible={outOfReach} target={target} />
      <GhostTrail points={trail} />
      <GoalZone at={goal} payload={object} seats={payloads.length} />
      {/* The landmark the instruction names, sitting at the datum it defines. */}
      <Prop url={targetUrl} widthMm={targetWidthMm} targetM={GOAL_R * 1.7}
            position={[goal[0], TABLE_Z, -goal[1]]} opacity={0.92} />
      {payloads.map((p, i) => (
        <Payload key={`${p.url}-${i}`} index={i} all={objects} url={p.url} widthMm={p.widthMm} />
      ))}
      <Arm
        target={target}
        grip={grip}
        held={held}
        dim={arms > 1 && activeArmView !== 0}
        onJoints={(next) => {
          joints.current = next;
        }}
      />
      {arms > 1 ? (
        <Arm
          base={ARM_B_BASE}
          target={targetB}
          grip={gripB}
          held={heldB}
          dim={activeArmView !== 1}
          onJoints={(next) => {
            jointsB.current = next;
          }}
        />
      ) : null}

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
        <lineBasicMaterial color={sceneColor.ruleStrong()} />
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
    for (const url of [...props.payloads.map((p) => p.url), props.targetUrl, props.environmentUrl]) {
      if (url) useGLTF.preload(url);
    }
  }, [props.payloads, props.targetUrl, props.environmentUrl]);

  const [lost, setLost] = useState(false);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  // Everything except presence goes to Rig: it must not re-render six times a
  // second just because somebody else moved.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ghosts: _presence, ...rigProps } = props;

  // A lost context leaves a black rectangle and no error anyone can see. Catch
  // it, tell the operator, and let the browser hand the context back.
  const onCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    // Lifted out so the headset button, which has to live outside the Canvas
    // to be reachable before a session exists, can hand the renderer its
    // session. Set through a ref rather than state: this runs during the
    // Canvas's own setup, and a setState here re-renders the thing being set up.
    setRenderer(gl);
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
      style={{ background: "var(--color-ink-1)", cursor: "crosshair" }}
    >
      {/* Ghosts tick six times a second; Rig must not re-render with them,
          or the whole scene reconciles on every presence update. */}
      <Rig key={props.runId} {...rigProps} />
      <Ghosts ghosts={props.ghosts ?? []} />
      <XRControls />
    </Canvas>
    {/* Only rendered at all where a headset answers. */}
    <EnterXR gl={renderer} className="absolute bottom-3 right-3 z-10" />
    </>
  );
}
